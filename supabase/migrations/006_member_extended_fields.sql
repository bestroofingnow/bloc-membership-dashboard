-- ============================================================
-- Migration 006: Extended member fields
-- Adds title, website, description, address, mobile phone,
-- birthday, member_since, renewal_due, referred_by
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS mobile_phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS birthday TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_since TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS renewal_due TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS referred_by TEXT;
