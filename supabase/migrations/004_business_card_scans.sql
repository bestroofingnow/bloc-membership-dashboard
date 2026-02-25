-- ============================================================
-- Migration 004: Business Card Scanner
-- Stores scanned business card data with CRM export tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS business_card_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  title TEXT DEFAULT '',
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  website TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  additional_notes TEXT DEFAULT '',
  exported_to_crm BOOLEAN DEFAULT false,
  exported_at TIMESTAMPTZ,
  scanned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE business_card_scans ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read scans
CREATE POLICY "Authenticated users can read scans"
  ON business_card_scans FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert scans
CREATE POLICY "Authenticated users can insert scans"
  ON business_card_scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins can manage all scans
CREATE POLICY "Admins can manage scans"
  ON business_card_scans FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_business_card_scans_updated_at ON business_card_scans;
CREATE TRIGGER update_business_card_scans_updated_at
  BEFORE UPDATE ON business_card_scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE business_card_scans;

-- Index for listing recent scans
CREATE INDEX IF NOT EXISTS idx_business_card_scans_created ON business_card_scans (created_at DESC);
