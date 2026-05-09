-- 012_intake_rsvps.sql
-- Guest leads from the public flow, their RSVPs, conflict audit, side-effect failures.

CREATE TABLE IF NOT EXISTS intake_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  other_category_text TEXT,
  ghl_contact_id TEXT,
  magic_token_hash TEXT,
  magic_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX intake_guests_email_normalized_idx ON intake_guests(email_normalized);
CREATE INDEX intake_guests_magic_token_hash_idx ON intake_guests(magic_token_hash) WHERE magic_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS intake_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES intake_guests(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  qr_token_id UUID REFERENCES qr_tokens(id) ON DELETE SET NULL,
  invited_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  conflict_kind TEXT NOT NULL CHECK (conflict_kind IN ('none','exact','related','other')),
  conflict_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','attended','no_show','canceled')),
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (guest_id, event_id)
);

CREATE INDEX intake_rsvps_event_id_idx ON intake_rsvps(event_id);
CREATE INDEX intake_rsvps_status_idx ON intake_rsvps(status);

CREATE TABLE IF NOT EXISTS intake_conflict_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL REFERENCES intake_rsvps(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL,
  industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  conflict_kind TEXT NOT NULL,
  occupants_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_side_effect_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL REFERENCES intake_rsvps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ghl','email')),
  error_code TEXT,
  error_msg TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX intake_side_effect_failures_unresolved_idx
  ON intake_side_effect_failures(rsvp_id) WHERE resolved_at IS NULL;

ALTER TABLE intake_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_conflict_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_side_effect_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_guests_admin_read" ON intake_guests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_rsvps_admin_read" ON intake_rsvps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_conflict_log_admin_read" ON intake_conflict_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_side_effect_failures_admin_read" ON intake_side_effect_failures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));
