-- ============================================================
-- Migration 016: After Hours member tier + chapter lunch URLs
-- ============================================================

-- 1. New member tier. Existing rows default to 'full'.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'full';

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_member_type_check;
ALTER TABLE members
  ADD CONSTRAINT members_member_type_check
  CHECK (member_type IN ('full', 'after_hours'));

-- 2. Chapter becomes optional (After Hours members have no chapter yet).
ALTER TABLE members
  ALTER COLUMN chapter DROP NOT NULL;

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_chapter_check;
ALTER TABLE members
  ADD CONSTRAINT members_chapter_check
  CHECK (chapter IS NULL OR chapter IN ('North','South','Uptown','FLOC','Alumni'));

-- 3. Seed per-chapter lunch registration URLs (admin-editable via dashboard_settings).
INSERT INTO dashboard_settings (key, value) VALUES
  ('lunch_url_south',  'https://businessleadersofcharlotte.com/event-6651645/Registration'),
  ('lunch_url_floc',   'https://businessleadersofcharlotte.com/event-6484425/Registration'),
  ('lunch_url_uptown', 'https://businessleadersofcharlotte.com/event-6484396/Registration'),
  ('lunch_url_north',  'https://businessleadersofcharlotte.com/event-6484506/Registration')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
