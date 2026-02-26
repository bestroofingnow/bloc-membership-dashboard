-- ============================================================
-- Migration 007: Dashboard settings
-- Stores configurable dashboard values (goals, impact stats)
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with defaults
INSERT INTO dashboard_settings (key, value) VALUES
  ('target_members', '125'),
  ('chapter_goal_north', '30'),
  ('chapter_goal_south', '25'),
  ('chapter_goal_uptown', '30'),
  ('chapter_goal_floc', '30'),
  ('chapter_goal_alumni', '20'),
  ('impact_referrals', '10,000+'),
  ('impact_transactions', '9,000+'),
  ('impact_charity', '$732,171.45')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON dashboard_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON dashboard_settings FOR ALL
  TO authenticated
  USING (public.is_admin());
