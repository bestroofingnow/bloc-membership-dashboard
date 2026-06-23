-- ============================================================
-- Migration 031: Membership Inbox
-- Inbound membership emails (new applications + acceptances) from the BLOC
-- online system (Wild Apricot) land here after an AI parse. Hybrid model:
-- applications auto-create a waiting lead (stage 'applied'); acceptances are
-- held 'pending' until a director approves, which promotes the lead to 'member'
-- and upserts the members row. Writes happen via the service role (webhook +
-- admin API); RLS gives directors/admins read for defense in depth.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.membership_inbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (kind IN ('application','acceptance','unknown')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','applied','dismissed','error')),

  -- Person extracted from the email.
  name         TEXT,
  email        TEXT,
  company      TEXT,
  phone        TEXT,
  chapter      TEXT,

  -- Raw email (for audit + re-parsing).
  from_address TEXT,
  subject      TEXT,
  raw_text     TEXT,
  raw_html     TEXT,

  -- AI output.
  ai_confidence NUMERIC,           -- 0..1
  ai_summary    TEXT,
  parsed        JSONB,

  -- Linkage + audit.
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  member_id    UUID REFERENCES public.members(id) ON DELETE SET NULL,
  applied_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  applied_at   TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS membership_inbox_status_idx  ON public.membership_inbox(status);
CREATE INDEX IF NOT EXISTS membership_inbox_created_idx ON public.membership_inbox(created_at DESC);
CREATE INDEX IF NOT EXISTS membership_inbox_email_idx   ON public.membership_inbox(lower(email));

ALTER TABLE public.membership_inbox ENABLE ROW LEVEL SECURITY;

-- Directors/admins may read; no anon/insert policy (service role bypasses RLS).
DROP POLICY IF EXISTS membership_inbox_staff_read ON public.membership_inbox;
CREATE POLICY membership_inbox_staff_read ON public.membership_inbox
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','chapter_director')
  ));

-- Realtime feed for the admin/app review screens.
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_inbox;

-- ---------- extend the lead funnel to accept an email-sourced lead ----------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('public_signup','qr_rsvp','card_scan','manual','import','membership_email'));

ALTER TABLE public.lead_links DROP CONSTRAINT IF EXISTS lead_links_source_table_check;
ALTER TABLE public.lead_links ADD CONSTRAINT lead_links_source_table_check
  CHECK (source_table IN ('guests','public_signups','intake_guests','intake_rsvps','business_card_scans','membership_inbox'));
