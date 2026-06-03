-- ============================================================
-- Migration 017: Scanner enhancements (promoted from scripts/sql/03)
-- Extend business_card_scans to track who scanned + what they scanned.
-- Idempotent (IF NOT EXISTS). New FKs are ON DELETE SET NULL.
-- /api/scan writes scanned_by_profile_id, target_guest_id,
-- target_member_id, email_normalized — without this migration the
-- scanner 500s on any environment where scripts/sql/03 was never run.
-- ============================================================

ALTER TABLE public.business_card_scans
  ADD COLUMN IF NOT EXISTS scanned_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_guest_id      uuid REFERENCES public.guests(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_member_id     uuid REFERENCES public.members(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_normalized     text;

-- Backfill normalized email for any pre-existing rows
UPDATE public.business_card_scans
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL AND email IS NOT NULL AND email <> '';

-- Indexes for the lookups the API does on every scan
CREATE INDEX IF NOT EXISTS business_card_scans_email_normalized_idx
  ON public.business_card_scans(email_normalized);
CREATE INDEX IF NOT EXISTS business_card_scans_scanned_by_idx
  ON public.business_card_scans(scanned_by_profile_id);
CREATE INDEX IF NOT EXISTS business_card_scans_target_member_idx
  ON public.business_card_scans(target_member_id);
