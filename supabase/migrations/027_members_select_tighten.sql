-- ============================================================
-- Migration 027: Tighten members SELECT (Phase 1 §5.3 STEP C) — GATED
--
-- PRECONDITION: the from('members') reader audit is GREEN (every direct reader
-- is staff-gated, owner self-read, service-role, or routed through
-- member_directory). The network-browse list reads member_directory (same row
-- count) so this does NOT trigger the static fallback for any member.
--
-- Drops the blanket USING(true) SELECT and replaces it with self+staff.
-- Uses the 005 helpers + current_user_email() (024); no inline profiles
-- subquery, so no recursion. Admin/director write policies are UNTOUCHED.
-- ============================================================

-- The original blanket read policy from migration 001.
DROP POLICY IF EXISTS "Members are viewable by authenticated users" ON members;

CREATE POLICY "members_select_self_and_staff"
  ON members FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_chapter_director()
    OR lower(email) = public.current_user_email()
  );
