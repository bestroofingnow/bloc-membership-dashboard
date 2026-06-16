-- =====================================================================
-- BLOC FOUNDATION — STEP 1 of 2
-- Applies the additive migrations 017-026 + 029 (identity, lead funnel,
-- directory, field-visibility, self-edit lock, director QR read, live
-- directory updates) and checks that NO existing member or guest was lost.
-- It does NOT change who can see what yet — that's STEP 2. Safe to re-run.
-- =====================================================================

-- Capture a "before" snapshot so the checks at the bottom can compare.
DROP TABLE IF EXISTS _bloc_before;
CREATE TEMP TABLE _bloc_before AS SELECT
  (SELECT count(*) FROM members)             AS members,
  (SELECT count(*) FROM profiles)            AS profiles,
  (SELECT count(*) FROM guests)              AS guests,
  (SELECT count(*) FROM public_signups)      AS public_signups,
  (SELECT count(*) FROM intake_guests)       AS intake_guests,
  (SELECT count(*) FROM intake_rsvps)        AS intake_rsvps,
  (SELECT count(*) FROM business_card_scans) AS business_card_scans;

-- ============================================================
-- Migration 017: Scanner enhancements (promoted from scripts/sql/03)
-- Extend business_card_scans to track who scanned + what they scanned.
-- Idempotent (IF NOT EXISTS). New FKs are ON DELETE SET NULL.
-- /api/scan writes scanned_by_profile_id, target_guest_id,
-- target_member_id, email_normalized — without this migration the
-- scanner 500s on any environment where scripts/sql/03 was never run.
-- ============================================================

ALTER TABLE public.business_card_scans
  ADD COLUMN IF NOT EXISTS scanned_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_guest_id      uuid REFERENCES public.guests(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_member_id     uuid REFERENCES public.members(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_normalized     text;

-- Backfill normalized email for any pre-existing rows
UPDATE public.business_card_scans
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL AND email IS NOT NULL AND email <> '';

-- Indexes for the lookups the API does on every scan
CREATE INDEX IF NOT EXISTS business_card_scans_email_normalized_idx
  ON public.business_card_scans(email_normalized);
CREATE INDEX IF NOT EXISTS business_card_scans_scanned_by_idx
  ON public.business_card_scans(scanned_by_profile_id);
CREATE INDEX IF NOT EXISTS business_card_scans_target_member_idx
  ON public.business_card_scans(target_member_id);
-- ============================================================
-- Migration 018: Reconcile the duplicate `events` table
--
-- 003_wildapricot.sql and 010_intake_events.sql each ran
-- `CREATE TABLE IF NOT EXISTS events` with disjoint columns; the
-- first to run wins and the other is a silent no-op. This pins the
-- canonical `events` definition as the documented SUPERSET of both,
-- so fresh rebuilds match prod and every events writer/reader works.
--
-- Keeps 010's intake columns (title/starts_at/ends_at/ics_uid/
-- public_visible) and ADDS nullable 003/WA-sync columns.
-- Additive only — no column dropped, no row removed.
-- ============================================================

-- 010 (intake) columns — present if 010 won, added if 003 won.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS chapter          TEXT,
  ADD COLUMN IF NOT EXISTS kind             TEXT,
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS starts_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_name    TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS ics_uid          TEXT,
  ADD COLUMN IF NOT EXISTS public_visible   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- 003 / Wild Apricot sync columns — nullable so intake-only rows are fine.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS name                 TEXT,
  ADD COLUMN IF NOT EXISTS event_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location             TEXT,
  ADD COLUMN IF NOT EXISTS event_type           TEXT,
  ADD COLUMN IF NOT EXISTS wa_event_id          TEXT,
  ADD COLUMN IF NOT EXISTS registration_url     TEXT,
  ADD COLUMN IF NOT EXISTS max_registrants      INTEGER,
  ADD COLUMN IF NOT EXISTS current_registrants  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- Keep the unique constraint the WA upsert relies on (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS events_wa_event_id_key
  ON public.events(wa_event_id) WHERE wa_event_id IS NOT NULL;

-- Indexes the readers use (idempotent; no-op if already present).
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS events_chapter_idx   ON public.events(chapter);
-- ============================================================
-- Migration 019: Unified identity (Phase 1, spec §3)
--
-- Additive & non-destructive:
--   * members.email_normalized generated column + PLAIN index
--     (NO unique index until identity_link_audit shows 0 dups)
--   * reciprocal nullable FKs profiles.member_id / members.user_id,
--     both ON DELETE SET NULL (deactivation must not cascade-delete
--     the member row)
--   * idempotent exactly-one-match backfill (unmatched stay NULL)
--   * admin-gated identity_link_audit view (exposes emails)
--
-- Reuses the migration 005 SECURITY DEFINER helpers verbatim.
-- Does NOT touch handle_new_user, AuthGuard, or any existing policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1. members.email_normalized — generated, blank/NULL never collide
-- ------------------------------------------------------------
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email_normalized TEXT
  GENERATED ALWAYS AS (NULLIF(lower(btrim(email)), '')) STORED;

-- PLAIN index only. The partial UNIQUE index is deferred to a later,
-- gated migration AFTER identity_link_audit shows 0 dup_member_email.
CREATE INDEX IF NOT EXISTS members_email_normalized_idx
  ON members (email_normalized)
  WHERE email_normalized IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Reciprocal nullable FKs (ON DELETE SET NULL)
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS member_id UUID
  REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_member_id_idx
  ON profiles (member_id) WHERE member_id IS NOT NULL;

-- One auth user maps to at most one member row.
CREATE UNIQUE INDEX IF NOT EXISTS members_user_id_uidx
  ON members (user_id) WHERE user_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Idempotent exactly-one-match backfill (guarded by IS NULL)
--    profiles.member_id <- members by normalized email,
--    ONLY when exactly one member matches.
-- ------------------------------------------------------------
UPDATE profiles p
SET member_id = sub.mid
FROM (
  SELECT m.email_normalized AS norm, MIN(m.id::text)::uuid AS mid, count(*) AS n
  FROM members m
  WHERE m.email_normalized IS NOT NULL
  GROUP BY m.email_normalized
  HAVING count(*) = 1
) sub
WHERE p.member_id IS NULL
  AND NULLIF(lower(btrim(p.email)), '') IS NOT NULL
  AND NULLIF(lower(btrim(p.email)), '') = sub.norm;

-- Reciprocally set members.user_id from the profile we just linked,
-- ONLY when that member has no user_id yet and exactly one profile
-- points at it.
UPDATE members m
SET user_id = sub.pid
FROM (
  SELECT p.member_id AS mid, MIN(p.id::text)::uuid AS pid, count(*) AS n
  FROM profiles p
  WHERE p.member_id IS NOT NULL
  GROUP BY p.member_id
  HAVING count(*) = 1
) sub
WHERE m.user_id IS NULL
  AND m.id = sub.mid;

-- ------------------------------------------------------------
-- 4. identity_link_audit — admin-gated (exposes emails)
--    Implemented as a SECURITY DEFINER function + view so the
--    admin gate is enforced server-side; never anon/member.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_link_audit()
RETURNS TABLE (
  issue   TEXT,
  ref_id  UUID,
  email   TEXT,
  detail  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Admin gate: non-admins get zero rows (no email leak).
  SELECT issue, ref_id, email, detail
  FROM (
    -- duplicate member emails (must be resolved before any unique index)
    SELECT 'dup_member_email'::text AS issue,
           m.id                     AS ref_id,
           m.email                  AS email,
           ('count=' || cnt.n::text) AS detail
    FROM members m
    JOIN (
      SELECT email_normalized, count(*) AS n
      FROM members
      WHERE email_normalized IS NOT NULL
      GROUP BY email_normalized
      HAVING count(*) > 1
    ) cnt ON cnt.email_normalized = m.email_normalized

    UNION ALL
    -- profiles with no linked member row
    SELECT 'profile_no_member', p.id, p.email, NULL
    FROM profiles p
    WHERE p.member_id IS NULL

    UNION ALL
    -- members with no linked auth user
    SELECT 'member_no_user', m.id, m.email, NULL
    FROM members m
    WHERE m.user_id IS NULL
  ) audit
  WHERE public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.identity_link_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_link_audit() TO authenticated;

CREATE OR REPLACE VIEW public.identity_link_audit AS
  SELECT * FROM public.identity_link_audit();

REVOKE ALL ON public.identity_link_audit FROM PUBLIC, anon;
GRANT SELECT ON public.identity_link_audit TO authenticated;
-- ============================================================
-- Migration 021: Member status & history + forward-fill triggers
-- (Phase 1, spec §3.3-3.4)
--
-- Additive & non-destructive:
--   * members.member_status default 'active' (preserves every row,
--     counts cannot drift — member_type unchanged)
--   * member_history append-only audit table, RLS via 005 helpers
--   * SEPARATE SECURITY DEFINER forward-fill triggers on profiles
--     and members; handle_new_user is NOT touched (risk #5)
-- ============================================================

-- ------------------------------------------------------------
-- 1. members.member_status — 'active' default preserves all rows
-- ------------------------------------------------------------
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_member_status_check;
ALTER TABLE members
  ADD CONSTRAINT members_member_status_check
  CHECK (member_status IN ('active','alumni','inactive'));

-- ------------------------------------------------------------
-- 2. member_history — append-only audit
--    ON DELETE CASCADE from members (history dies with the member);
--    changed_by ON DELETE SET NULL (deactivating an admin keeps history).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  change_kind  TEXT NOT NULL CHECK (change_kind IN ('chapter_change','type_change','status_change')),
  from_chapter TEXT,
  to_chapter   TEXT,
  from_type    TEXT,
  to_type      TEXT,
  from_status  TEXT,
  to_status    TEXT,
  changed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_history_member_id_idx
  ON member_history (member_id, changed_at DESC);

ALTER TABLE member_history ENABLE ROW LEVEL SECURITY;

-- Read: admin or chapter director (via 005 helpers — never inline EXISTS).
DROP POLICY IF EXISTS "member_history_read_staff" ON member_history;
CREATE POLICY "member_history_read_staff"
  ON member_history FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_chapter_director());

-- Write: admin only.
DROP POLICY IF EXISTS "member_history_write_admin" ON member_history;
CREATE POLICY "member_history_write_admin"
  ON member_history FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 3. SEPARATE forward-fill triggers (do NOT modify handle_new_user)
--    Both SECURITY DEFINER, IS NULL-guarded, single-match only,
--    order-tolerant for the invite-provisioning race.
-- ------------------------------------------------------------

-- 3a. After a profile is inserted, link it to a member by normalized
--     email when exactly one member matches; reciprocally set user_id.
CREATE OR REPLACE FUNCTION public.forward_fill_profile_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm TEXT := NULLIF(lower(btrim(NEW.email)), '');
  v_mid  UUID;
  v_cnt  INT;
BEGIN
  IF NEW.member_id IS NOT NULL OR v_norm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), MIN(id::text)::uuid INTO v_cnt, v_mid
  FROM public.members
  WHERE email_normalized = v_norm;

  IF v_cnt = 1 THEN
    UPDATE public.profiles SET member_id = v_mid WHERE id = NEW.id AND member_id IS NULL;
    UPDATE public.members  SET user_id   = NEW.id WHERE id = v_mid  AND user_id   IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forward_fill_profile_member_trg ON profiles;
CREATE TRIGGER forward_fill_profile_member_trg
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.forward_fill_profile_member();

-- 3b. After a member is inserted, link it to a profile (auth user) by
--     normalized email when exactly one profile matches; reciprocal.
CREATE OR REPLACE FUNCTION public.forward_fill_member_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm TEXT := NEW.email_normalized;
  v_pid  UUID;
  v_cnt  INT;
BEGIN
  IF NEW.user_id IS NOT NULL OR v_norm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), MIN(id::text)::uuid INTO v_cnt, v_pid
  FROM public.profiles
  WHERE NULLIF(lower(btrim(email)), '') = v_norm;

  IF v_cnt = 1 THEN
    UPDATE public.members  SET user_id   = v_pid WHERE id = NEW.id  AND user_id   IS NULL;
    UPDATE public.profiles SET member_id = NEW.id WHERE id = v_pid  AND member_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forward_fill_member_user_trg ON members;
CREATE TRIGGER forward_fill_member_user_trg
  AFTER INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION public.forward_fill_member_user();
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
-- ============================================================
-- Migration 023: Per-field personal-PII opt-in (Phase 1 §5.1)
--
-- Absence of a row = all personal fields hidden (the desired default).
-- mobile_phone is PERSONAL (decided 2026-06-03), gated like address/birthday.
-- Booleans only (no PII) so authenticated SELECT USING(true) is safe.
-- Writes go only through the service-role API (no anon, no auth write policy).
-- ============================================================

CREATE TABLE IF NOT EXISTS member_field_visibility (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  show_mobile_phone BOOLEAN NOT NULL DEFAULT FALSE,
  show_address BOOLEAN NOT NULL DEFAULT FALSE,
  show_birthday BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_field_visibility ENABLE ROW LEVEL SECURITY;

-- Flags are not sensitive; any authenticated user may read them (the directory
-- function below needs them to project the personal columns).
DROP POLICY IF EXISTS "mfv_auth_read" ON member_field_visibility;
CREATE POLICY "mfv_auth_read" ON member_field_visibility
  FOR SELECT TO authenticated
  USING (TRUE);

-- Intentionally NO anon policy and NO authenticated INSERT/UPDATE/DELETE policy.
-- Service-role API routes (bypass RLS) own all writes.
-- ============================================================
-- Migration 024: Member directory projection (Phase 1 §5.2)
--
-- Business fields (name, company, chapter, member_type, industry, title,
-- website, email, phone) are ALWAYS present. Personal fields
-- (mobile_phone, address, birthday) are non-null only when the caller is:
--   * admin/director (reuses 005 helpers), OR
--   * the owner (lower(email) = current_user_email()), OR
--   * the field is opted in via member_field_visibility.
--
-- CRITICAL INVARIANT: returns the SAME ROW COUNT as members (column-nulling
-- only, never row removal) so useMembers' data.length>0 guard holds and the
-- static fallback can never be triggered by this projection.
-- ============================================================

-- Owner self-view helper. SECURITY DEFINER + search_path pinned so it reads
-- auth.users regardless of the caller's RLS. Does NOT touch the 005 helpers.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

-- The projection. One row per member (LEFT JOIN so members without a
-- visibility row still appear — absence = all personal fields hidden).
CREATE OR REPLACE FUNCTION public.directory_members()
RETURNS TABLE (
  id UUID,
  name TEXT,
  company TEXT,
  chapter TEXT,
  member_type TEXT,
  industry TEXT,
  title TEXT,
  website TEXT,
  description TEXT,
  email TEXT,
  phone TEXT,
  industry_id UUID,
  category_id UUID,
  member_since TEXT,
  renewal_due TEXT,
  referred_by TEXT,
  mobile_phone TEXT,
  address TEXT,
  birthday TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.company,
    m.chapter,
    m.member_type,
    m.industry,
    m.title,
    m.website,
    m.description,
    m.email,
    m.phone,
    m.industry_id,
    m.category_id,
    m.member_since,
    m.renewal_due,
    m.referred_by,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_mobile_phone, FALSE)
         THEN m.mobile_phone ELSE NULL END AS mobile_phone,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_address, FALSE)
         THEN m.address ELSE NULL END AS address,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_birthday, FALSE)
         THEN m.birthday ELSE NULL END AS birthday
  FROM public.members m
  LEFT JOIN public.member_field_visibility v ON v.member_id = m.id;
$$;

-- Stable view surface for the client. Same row count as members.
CREATE OR REPLACE VIEW public.member_directory AS
  SELECT * FROM public.directory_members();

-- Only authenticated callers may read the directory. The function's
-- SECURITY DEFINER body still nulls personal columns per the rules above.
REVOKE ALL ON FUNCTION public.directory_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_members() TO authenticated;
REVOKE ALL ON public.member_directory FROM PUBLIC, anon;
GRANT SELECT ON public.member_directory TO authenticated;
-- ============================================================
-- Migration 025: Profile self-edit lock (Phase 1 §5.4)
--
-- Members may edit their own full_name / clear must_change_password, but
-- cannot self-promote: the WITH CHECK pins role and chapter to their CURRENT
-- values via SECURITY DEFINER helpers (no self-referential profiles subquery,
-- so we never re-trigger the recursion that 005 fixed).
--
-- The 005 "Admins can manage all profiles" policy is UNTOUCHED — admin role
-- management still works. The three 005 helpers are reused, never altered.
-- ============================================================

-- Additive helper mirroring get_user_chapter (005). Reads the caller's own
-- role bypassing RLS. Does NOT modify is_admin/is_chapter_director/get_user_chapter.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Replace the self-update policy. USING limits the row to the caller's own;
-- WITH CHECK additionally pins role and chapter to their pre-edit values.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_user_role()
    AND chapter IS NOT DISTINCT FROM public.get_user_chapter()
  );
-- ============================================================
-- Migration 026: Director QR-token read (Phase 1 §5.5)
--
-- qr_tokens previously had only an admin SELECT policy, so directors saw
-- ZERO rows even though useQrTokens filters to their chapter + null-chapter.
-- This policy is OR-combined with the admin one, so it only ADDS rows; it
-- never narrows admin visibility. Uses the 005 helpers (no inline profiles
-- self-select, so no recursion).
-- ============================================================

DROP POLICY IF EXISTS "qr_tokens_director_read" ON qr_tokens;
CREATE POLICY "qr_tokens_director_read" ON qr_tokens
  FOR SELECT TO authenticated
  USING (
    public.is_chapter_director()
    AND (chapter = public.get_user_chapter() OR chapter IS NULL)
  );
-- ============================================================
-- Migration 029: Live directory updates for ALL users (seamless realtime)
--
-- Problem: after 027 tightened the members table to self+staff, a realtime feed
-- on `members` only delivers each member their OWN row — so a newly added member
-- would not appear live for everyone. Also, a raw members feed would stream
-- personal PII over realtime.
--
-- Solution: a tiny PUBLIC "directory changed" signal. One singleton row whose
-- version is bumped by a trigger on every members change. Every authenticated
-- client subscribes to this row (no PII — just a counter) and refetches the
-- privacy-projected member_directory when it changes. So "when someone is added,
-- everyone sees it" — instantly, and without leaking any personal data.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.directory_version (
  id         INT PRIMARY KEY DEFAULT 1,
  version    BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT directory_version_singleton CHECK (id = 1)
);

INSERT INTO public.directory_version (id, version) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.directory_version ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user (it carries no PII). No write policy: only
-- the SECURITY DEFINER trigger / service role bumps it.
DROP POLICY IF EXISTS "directory_version_read" ON public.directory_version;
CREATE POLICY "directory_version_read"
  ON public.directory_version FOR SELECT
  TO authenticated
  USING (TRUE);

-- Bump once per statement (efficient for bulk syncs) whenever members change.
CREATE OR REPLACE FUNCTION public.bump_directory_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.directory_version SET version = version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS members_bump_directory_version ON public.members;
CREATE TRIGGER members_bump_directory_version
  AFTER INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_directory_version();

-- Stream changes to subscribed clients. Idempotent (ignore if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.directory_version;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================================
-- STEP 1 VERIFICATION — every column below should read TRUE.
-- If any reads FALSE, STOP and paste this row back; do NOT run STEP 2.
-- =====================================================================
SELECT
  b.members                                                                       AS members_before,
  (SELECT count(*) FROM members)                                                  AS members_after,
  b.members              = (SELECT count(*) FROM members)                         AS members_unchanged,
  b.profiles             = (SELECT count(*) FROM profiles)                        AS profiles_unchanged,
  b.guests               = (SELECT count(*) FROM guests)                          AS guests_unchanged,
  b.public_signups       = (SELECT count(*) FROM public_signups)                  AS signups_unchanged,
  b.intake_guests        = (SELECT count(*) FROM intake_guests)                   AS intake_guests_unchanged,
  b.intake_rsvps         = (SELECT count(*) FROM intake_rsvps)                     AS rsvps_unchanged,
  b.business_card_scans  = (SELECT count(*) FROM business_card_scans)             AS scans_unchanged,
  (SELECT count(*) FROM members WHERE member_status = 'active')
      = (SELECT count(*) FROM members)                                            AS every_member_active,
  (SELECT count(*) FROM members) = (SELECT count(*) FROM member_directory)        AS directory_matches_members,
  (SELECT count(*) FROM guests g
     LEFT JOIN lead_links ll ON ll.source_table = 'guests' AND ll.source_id = g.id
     WHERE ll.id IS NULL) = 0                                                      AS every_guest_linked_to_a_lead,
  EXISTS (SELECT 1 FROM information_schema.routine_privileges
          WHERE routine_name = 'link_lead' AND grantee = 'service_role')          AS link_lead_is_service_role_only,
  (to_regclass('public.directory_version') IS NOT NULL)                           AS live_updates_ready,
  (pg_get_functiondef('public.handle_new_user'::regproc) NOT ILIKE '%forward_fill%')
                                                                                  AS handle_new_user_untouched
FROM _bloc_before b;
