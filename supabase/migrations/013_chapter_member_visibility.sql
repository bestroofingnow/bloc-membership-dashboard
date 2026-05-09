-- 013_chapter_member_visibility.sql
-- Per-chapter opt-in for the public roster preview. Default visible.

CREATE TABLE IF NOT EXISTS chapter_member_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  public_business_name TEXT,
  public_category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, chapter)
);

CREATE INDEX chapter_member_visibility_chapter_visible_idx
  ON chapter_member_visibility(chapter) WHERE visible = TRUE;

ALTER TABLE chapter_member_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmv_public_read_visible" ON chapter_member_visibility
  FOR SELECT TO anon
  USING (visible = TRUE);

CREATE POLICY "cmv_auth_read" ON chapter_member_visibility
  FOR SELECT TO authenticated USING (TRUE);
