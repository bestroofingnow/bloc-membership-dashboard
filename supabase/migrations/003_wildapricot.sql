-- ============================================================
-- Migration 003: Wild Apricot Integration
-- Adds WA contact IDs, events table, and sync logging
-- ============================================================

-- Add Wild Apricot contact ID to members table for linking
ALTER TABLE members ADD COLUMN IF NOT EXISTS wa_contact_id TEXT UNIQUE;

-- Add Wild Apricot contact ID to guests table for tracking pushed members
ALTER TABLE guests ADD COLUMN IF NOT EXISTS wa_contact_id TEXT;

-- ============================================================
-- Events table (synced from Wild Apricot)
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  event_type TEXT, -- 'after_hours', 'lunch', 'social', 'other'
  wa_event_id TEXT UNIQUE,
  registration_url TEXT,
  max_registrants INTEGER,
  current_registrants INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read events
CREATE POLICY "Authenticated users can read events"
  ON events FOR SELECT
  TO authenticated
  USING (true);

-- Admins can manage events
CREATE POLICY "Admins can manage events"
  ON events FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- Wild Apricot sync log
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL, -- 'members', 'events', 'push_member'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
  records_synced INTEGER DEFAULT 0,
  records_added INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- RLS for sync log
ALTER TABLE wa_sync_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read sync logs
CREATE POLICY "Authenticated users can read sync logs"
  ON wa_sync_log FOR SELECT
  TO authenticated
  USING (true);

-- Admins can write sync logs
CREATE POLICY "Admins can manage sync logs"
  ON wa_sync_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Enable realtime for events
ALTER PUBLICATION supabase_realtime ADD TABLE events;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date);
CREATE INDEX IF NOT EXISTS idx_events_wa_id ON events (wa_event_id);
CREATE INDEX IF NOT EXISTS idx_members_wa_id ON members (wa_contact_id);
CREATE INDEX IF NOT EXISTS idx_wa_sync_log_type ON wa_sync_log (sync_type, started_at DESC);
