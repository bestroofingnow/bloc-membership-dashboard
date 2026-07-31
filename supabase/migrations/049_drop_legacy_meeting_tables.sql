-- ============================================================
-- Migration 049: Drop legacy pairwise meeting tables
-- Only apply after confirming (a) migration 046's backfill reconciled
-- (Task 1, Step 2) and (b) no app code references meeting_invites or
-- one_to_ones anymore (Tasks 12, 17).
-- ============================================================
DROP TABLE IF EXISTS public.meeting_invites;
DROP TABLE IF EXISTS public.one_to_ones;
