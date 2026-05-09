-- 010_intake_events.sql
-- Public-visible events that the guest flow's event picker reads from.

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter TEXT CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),
  kind TEXT NOT NULL CHECK (kind IN ('lunch','after_hours','special')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  location_name TEXT,
  location_address TEXT,
  ics_uid TEXT UNIQUE NOT NULL,
  public_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX events_starts_at_idx ON events(starts_at);
CREATE INDEX events_chapter_idx ON events(chapter);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read" ON events
  FOR SELECT TO anon
  USING (public_visible = TRUE);

CREATE POLICY "events_auth_read" ON events
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "events_admin_write" ON events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
