-- ============================================================
-- Migration 022: One Lead Funnel (additive spine)
-- The three lead stores (guests / public_signups / intake_guests+rsvps) plus
-- the card scanner feed ONE lead model keyed off email_normalized.
-- ADDITIVE ONLY: no data migrated out, source rows stay in their own tables,
-- lead_links is the no-orphan glue. New tables get NO anon policy; public
-- writers use the service role (bypasses RLS).
-- ============================================================

-- ---------- stage_rank(): forward-only ladder (mirrors src/lib/leads/stage.ts) ----------
CREATE OR REPLACE FUNCTION public.stage_rank(s TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'new'      THEN 0
    WHEN 'rsvp'     THEN 1
    WHEN 'attended' THEN 2
    WHEN 'applied'  THEN 3
    WHEN 'approved' THEN 4
    WHEN 'member'   THEN 5
    WHEN 'declined' THEN 9
    ELSE -1
  END
$$;

-- ---------- leads: one row per person ----------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT UNIQUE,                  -- nullable: scanner no-email & handwritten leads
  name TEXT,
  company TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('public_signup','qr_rsvp','card_scan','manual','import')),
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','rsvp','attended','applied','approved','member','declined')),
  invited_by_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  owner_profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_due TIMESTAMPTZ,
  matched_member_id   UUID REFERENCES public.members(id) ON DELETE SET NULL,
  converted_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_email_normalized_idx ON public.leads(email_normalized);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads(stage);
CREATE INDEX IF NOT EXISTS leads_invited_by_idx ON public.leads(invited_by_member_id);
CREATE INDEX IF NOT EXISTS leads_next_action_due_idx ON public.leads(next_action_due);

-- ---------- lead_links: polymorphic glue, the no-orphan mechanism ----------
CREATE TABLE IF NOT EXISTS public.lead_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL CHECK (source_table IN
    ('guests','public_signups','intake_guests','intake_rsvps','business_card_scans')),
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)   -- every source row links exactly once
);

CREATE INDEX IF NOT EXISTS lead_links_lead_id_idx ON public.lead_links(lead_id);

-- ---------- lead_status_events: append-only shared timeline ----------
CREATE TABLE IF NOT EXISTS public.lead_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_status_events_lead_id_idx ON public.lead_status_events(lead_id);

-- ---------- RLS: staff read+write via the 005 helpers; NO anon policy ----------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_staff_rw" ON public.leads;
CREATE POLICY "leads_staff_rw" ON public.leads
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

DROP POLICY IF EXISTS "lead_links_staff_rw" ON public.lead_links;
CREATE POLICY "lead_links_staff_rw" ON public.lead_links
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

DROP POLICY IF EXISTS "lead_status_events_staff_rw" ON public.lead_status_events;
CREATE POLICY "lead_status_events_staff_rw" ON public.lead_status_events
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

-- updated_at trigger reuse (update_updated_at_column() defined in 001)
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- map_kanban_stage(): mirrors src/lib/leads/stage.ts mapKanbanStage ----------
CREATE OR REPLACE FUNCTION public.map_kanban_stage(legacy_status TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE legacy_status
    WHEN 'New Lead'             THEN 'new'
    WHEN 'After Hours Invited'  THEN 'rsvp'
    WHEN 'After Hours Done'     THEN 'attended'
    WHEN 'Lunch Invited'        THEN 'attended'
    WHEN 'Lunch Done'           THEN 'attended'
    WHEN 'Application Sent'     THEN 'applied'
    WHEN 'Application Received' THEN 'applied'
    WHEN 'Approved'            THEN 'approved'
    WHEN 'Declined'            THEN 'declined'
    ELSE 'new'
  END
$$;

-- ---------- link_lead(): the single idempotent entry point ----------
-- find-or-create by email; enrich blanks only; link source row ON CONFLICT DO NOTHING;
-- append a timeline event; advance stage forward-only. SECURITY DEFINER so it can
-- write across RLS; GRANTed to service_role only.
CREATE OR REPLACE FUNCTION public.link_lead(
  p_source_table TEXT,
  p_source_id    UUID,
  p_email        TEXT DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_company      TEXT DEFAULT NULL,
  p_phone        TEXT DEFAULT NULL,
  p_source       TEXT DEFAULT 'manual',
  p_stage        TEXT DEFAULT 'new',
  p_invited_by_member_id UUID DEFAULT NULL,
  p_matched_member_id    UUID DEFAULT NULL,
  p_actor_profile_id     UUID DEFAULT NULL,
  p_note         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_norm TEXT := NULLIF(lower(btrim(p_email)), '');
  v_lead_id UUID;
  v_existing_link UUID;
  v_old_stage TEXT;
BEGIN
  -- Validate the canonical stage; bad input falls back to 'new' rather than erroring.
  IF public.stage_rank(p_stage) < 0 THEN
    p_stage := 'new';
  END IF;

  -- 0) If this exact source row is already linked, reuse its lead (idempotent re-runs).
  SELECT lead_id INTO v_existing_link
  FROM public.lead_links
  WHERE source_table = p_source_table AND source_id = p_source_id;

  IF v_existing_link IS NOT NULL THEN
    v_lead_id := v_existing_link;
  ELSIF v_email_norm IS NOT NULL THEN
    -- 1) Find-or-create by normalized email.
    SELECT id INTO v_lead_id FROM public.leads WHERE email_normalized = v_email_norm;
  END IF;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (email_normalized, name, company, phone, source, stage,
                              invited_by_member_id, matched_member_id)
    VALUES (v_email_norm, NULLIF(btrim(p_name),''), NULLIF(btrim(p_company),''),
            NULLIF(btrim(p_phone),''), p_source, p_stage,
            p_invited_by_member_id, p_matched_member_id)
    RETURNING id INTO v_lead_id;
  ELSE
    -- 2) Enrich BLANKS ONLY — never clobber human-edited fields.
    UPDATE public.leads SET
      name                 = COALESCE(name, NULLIF(btrim(p_name),'')),
      company              = COALESCE(company, NULLIF(btrim(p_company),'')),
      phone                = COALESCE(phone, NULLIF(btrim(p_phone),'')),
      email_normalized     = COALESCE(email_normalized, v_email_norm),
      invited_by_member_id = COALESCE(invited_by_member_id, p_invited_by_member_id),
      matched_member_id    = COALESCE(matched_member_id, p_matched_member_id),
      updated_at           = NOW()
    WHERE id = v_lead_id;
  END IF;

  -- 3) Link the source row (idempotent).
  INSERT INTO public.lead_links (lead_id, source_table, source_id)
  VALUES (v_lead_id, p_source_table, p_source_id)
  ON CONFLICT (source_table, source_id) DO NOTHING;

  -- 4) Advance stage forward-only and append a timeline event when it actually moves.
  SELECT stage INTO v_old_stage FROM public.leads WHERE id = v_lead_id;
  IF public.stage_rank(p_stage) > public.stage_rank(v_old_stage) THEN
    UPDATE public.leads SET stage = p_stage, updated_at = NOW() WHERE id = v_lead_id;
    INSERT INTO public.lead_status_events
      (lead_id, from_stage, to_stage, source_table, source_id, actor_profile_id, note)
    VALUES (v_lead_id, v_old_stage, p_stage, p_source_table, p_source_id, p_actor_profile_id, p_note);
  ELSE
    -- No forward move, but still record the touch (e.g. a networking scan).
    INSERT INTO public.lead_status_events
      (lead_id, from_stage, to_stage, source_table, source_id, actor_profile_id, note)
    VALUES (v_lead_id, v_old_stage, v_old_stage, p_source_table, p_source_id, p_actor_profile_id, p_note);
  END IF;

  RETURN v_lead_id;
END;
$$;

-- The RPC is the only write path; lock it to the service role (public writers use it).
-- NB: Supabase default privileges GRANT EXECUTE directly to anon/authenticated at
-- creation, so revoking PUBLIC alone is insufficient — revoke those roles explicitly.
REVOKE ALL ON FUNCTION public.link_lead(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_lead(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT
) TO service_role;

-- ---------- v_lead_pipeline: staff-only board view (no UI consumer this slice) ----------
-- security_invoker so the underlying leads/lead_links RLS (staff-only) is enforced
-- per-caller; members select zero rows cleanly.
CREATE OR REPLACE VIEW public.v_lead_pipeline
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.email_normalized,
  l.name,
  l.company,
  l.phone,
  l.source,
  l.stage,
  l.invited_by_member_id,
  m.name AS invited_by_member_name,
  l.owner_profile_id,
  l.next_action,
  l.next_action_due,
  l.matched_member_id,
  l.converted_member_id,
  l.ghl_contact_id,
  l.created_at,
  l.updated_at,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'intake_rsvps')        AS has_qr_rsvp,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'business_card_scans') AS has_scan,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'public_signups')      AS has_application,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'guests')              AS has_kanban_card,
  (l.next_action_due IS NOT NULL AND l.next_action_due < NOW())                  AS is_overdue
FROM public.leads l
LEFT JOIN public.members m ON m.id = l.invited_by_member_id;

GRANT SELECT ON public.v_lead_pipeline TO authenticated;

-- ---------- Backfill (idempotent, guarded by a dashboard_settings sentinel) ----------
-- Strongest-identity-first so the canonical lead inherits the richest record:
--   intake_guests -> guests -> public_signups -> business_card_scans.
-- Email-less rows still get their own lead (link_lead handles NULL email).
-- ADDITIVE ONLY: never deletes a source row, never touches intake_guests with a live
-- magic link. lead_links UNIQUE(source_table,source_id) makes every row link once.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Sentinel: skip if a prior run already completed.
  IF EXISTS (SELECT 1 FROM public.dashboard_settings WHERE key = 'lead_funnel_backfill_done') THEN
    RAISE NOTICE 'lead_funnel backfill already done; skipping';
    RETURN;
  END IF;

  -- 1) intake_guests (+ their RSVPs) — strongest identity (verified email + RSVP).
  FOR r IN
    SELECT ig.id AS guest_id,
           ig.email_normalized,
           (ig.first_name || ' ' || ig.last_name) AS full_name,
           ig.business_name,
           rsv.id AS rsvp_id,
           rsv.status AS rsvp_status,
           rsv.invited_by_member_id
    FROM public.intake_guests ig
    LEFT JOIN LATERAL (
      SELECT id, status, invited_by_member_id
      FROM public.intake_rsvps
      WHERE guest_id = ig.id
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    ) rsv ON TRUE
  LOOP
    PERFORM public.link_lead(
      'intake_guests', r.guest_id, r.email_normalized, r.full_name, r.business_name, NULL,
      'qr_rsvp',
      CASE r.rsvp_status
        WHEN 'attended' THEN 'attended'
        WHEN 'canceled' THEN 'declined'
        WHEN 'no_show'  THEN 'rsvp'
        ELSE 'rsvp'
      END,
      r.invited_by_member_id, NULL, NULL, 'backfill: intake_guests'
    );
    IF r.rsvp_id IS NOT NULL THEN
      PERFORM public.link_lead(
        'intake_rsvps', r.rsvp_id, r.email_normalized, r.full_name, r.business_name, NULL,
        'qr_rsvp',
        CASE r.rsvp_status
          WHEN 'attended' THEN 'attended'
          WHEN 'canceled' THEN 'declined'
          WHEN 'no_show'  THEN 'rsvp'
          ELSE 'rsvp'
        END,
        r.invited_by_member_id, NULL, NULL, 'backfill: intake_rsvps'
      );
    END IF;
  END LOOP;

  -- 2) guests (kanban) — project the 8 legacy statuses; full granularity stays in guests.status.
  FOR r IN
    SELECT id, NULLIF(lower(btrim(email)),'') AS email_normalized, name, company, phone, status
    FROM public.guests
  LOOP
    PERFORM public.link_lead(
      'guests', r.id, r.email_normalized, r.name, r.company, r.phone,
      'card_scan', public.map_kanban_stage(r.status),
      NULL, NULL, NULL, 'backfill: guests'
    );
  END LOOP;

  -- 3) public_signups — applied-to-join.
  FOR r IN
    SELECT id, NULLIF(lower(btrim(email)),'') AS email_normalized, name, company, phone
    FROM public.public_signups
  LOOP
    PERFORM public.link_lead(
      'public_signups', r.id, r.email_normalized, r.name, r.company, r.phone,
      'public_signup', 'applied', NULL, NULL, NULL, 'backfill: public_signups'
    );
  END LOOP;

  -- 4) business_card_scans — weakest identity (no-email rows still get a lead).
  FOR r IN
    SELECT id,
           COALESCE(email_normalized, NULLIF(lower(btrim(email)),'')) AS email_normalized,
           name, company, phone, target_member_id
    FROM public.business_card_scans
  LOOP
    PERFORM public.link_lead(
      'business_card_scans', r.id, r.email_normalized, r.name, r.company, r.phone,
      'card_scan', 'new', NULL, r.target_member_id, NULL, 'backfill: business_card_scans'
    );
  END LOOP;

  INSERT INTO public.dashboard_settings (key, value)
  VALUES ('lead_funnel_backfill_done', NOW()::text)
  ON CONFLICT (key) DO NOTHING;
END $$;
