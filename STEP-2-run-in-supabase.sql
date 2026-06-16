-- =====================================================================
-- BLOC FOUNDATION — STEP 2 of 2  (run ONLY after STEP 1 passed)
-- Tightens the members AND guests tables so a plain member can read only
-- their own member row + staff rows, and can no longer read raw guest PII.
-- The whole-network browse keeps working via member_directory (still returns
-- every row). Recruiting (guests) becomes staff-only. Safe to re-run.
-- =====================================================================

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
-- ============================================================
-- Migration 028: Tighten guests SELECT to staff only
--
-- guests holds recruiting PII (prospect emails / phones / notes). The 001 policy
-- "Guests are viewable by authenticated users" USING(true) let ANY logged-in
-- member read every guest row directly. Recruiting is staff-only (the Guest
-- Pipeline tab is already hidden from members), so restrict reads to admin /
-- chapter_director via the 005 SECURITY DEFINER helpers (no inline profiles
-- subquery -> no recursion). Mirrors the members tightening in 027.
--
-- The "Admins can manage all guests" write policy (001) is UNTOUCHED. Server
-- routes (scan, intake) use the service role and bypass RLS, so they still work.
-- ============================================================

DROP POLICY IF EXISTS "Guests are viewable by authenticated users" ON guests;

CREATE POLICY "guests_select_staff"
  ON guests FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_chapter_director());

-- =====================================================================
-- STEP 2 VERIFICATION — every column below should read TRUE.
-- The decisive one is directory_still_matches_members: it proves a plain
-- member still sees the whole directory even after tightening.
-- =====================================================================
SELECT
  (SELECT count(*) FROM members)                                                  AS members,
  (SELECT count(*) FROM member_directory)                                         AS directory_rows,
  (SELECT count(*) FROM members) = (SELECT count(*) FROM member_directory)        AS directory_still_matches_members,
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename = 'members'
                AND policyname = 'Members are viewable by authenticated users')   AS members_blanket_removed,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE tablename = 'members'
            AND policyname = 'members_select_self_and_staff')                     AS members_self_and_staff_present,
  NOT EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename = 'guests'
                AND policyname = 'Guests are viewable by authenticated users')    AS guests_blanket_removed,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE tablename = 'guests'
            AND policyname = 'guests_select_staff')                              AS guests_staff_policy_present;
