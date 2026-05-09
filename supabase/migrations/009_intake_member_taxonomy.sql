-- 009_intake_member_taxonomy.sql
-- Add taxonomy FKs to members so the conflict engine can resolve
-- "what industry+category does each member hold in their chapter?"

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS members_industry_id_idx ON members(industry_id);
CREATE INDEX IF NOT EXISTS members_category_id_idx ON members(category_id);
CREATE INDEX IF NOT EXISTS members_chapter_industry_category_idx
  ON members(chapter, industry_id, category_id);
