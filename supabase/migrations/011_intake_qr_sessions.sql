-- 011_intake_qr_sessions.sql
-- Signed-token registry for QR codes, plus short-lived wizard sessions.

CREATE TABLE IF NOT EXISTS qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general','chapter','event','member_invite','after_hours')),
  chapter TEXT CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  invited_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  label TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scan_count INT NOT NULL DEFAULT 0,
  last_scanned_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX qr_tokens_token_idx ON qr_tokens(token);
CREATE INDEX qr_tokens_chapter_idx ON qr_tokens(chapter);

ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_tokens_admin_read" ON qr_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  partial_payload JSONB NOT NULL DEFAULT '{}',
  current_step TEXT NOT NULL CHECK (current_step IN ('landing','event','chapter','details')),
  ip_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX intake_sessions_expires_at_idx ON intake_sessions(expires_at);
CREATE INDEX intake_sessions_token_idx ON intake_sessions(token);

ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;
