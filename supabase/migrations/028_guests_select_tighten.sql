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
