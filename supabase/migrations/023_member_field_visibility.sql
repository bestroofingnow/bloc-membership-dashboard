-- ============================================================
-- Migration 023: Per-field personal-PII opt-in (Phase 1 §5.1)
--
-- Absence of a row = all personal fields hidden (the desired default).
-- mobile_phone is PERSONAL (decided 2026-06-03), gated like address/birthday.
-- Booleans only (no PII) so authenticated SELECT USING(true) is safe.
-- Writes go only through the service-role API (no anon, no auth write policy).
-- ============================================================

CREATE TABLE IF NOT EXISTS member_field_visibility (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  show_mobile_phone BOOLEAN NOT NULL DEFAULT FALSE,
  show_address BOOLEAN NOT NULL DEFAULT FALSE,
  show_birthday BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_field_visibility ENABLE ROW LEVEL SECURITY;

-- Flags are not sensitive; any authenticated user may read them (the directory
-- function below needs them to project the personal columns).
DROP POLICY IF EXISTS "mfv_auth_read" ON member_field_visibility;
CREATE POLICY "mfv_auth_read" ON member_field_visibility
  FOR SELECT TO authenticated
  USING (TRUE);

-- Intentionally NO anon policy and NO authenticated INSERT/UPDATE/DELETE policy.
-- Service-role API routes (bypass RLS) own all writes.
