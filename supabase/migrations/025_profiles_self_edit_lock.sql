-- ============================================================
-- Migration 025: Profile self-edit lock (Phase 1 §5.4)
--
-- Members may edit their own full_name / clear must_change_password, but
-- cannot self-promote: the WITH CHECK pins role and chapter to their CURRENT
-- values via SECURITY DEFINER helpers (no self-referential profiles subquery,
-- so we never re-trigger the recursion that 005 fixed).
--
-- The 005 "Admins can manage all profiles" policy is UNTOUCHED — admin role
-- management still works. The three 005 helpers are reused, never altered.
-- ============================================================

-- Additive helper mirroring get_user_chapter (005). Reads the caller's own
-- role bypassing RLS. Does NOT modify is_admin/is_chapter_director/get_user_chapter.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Replace the self-update policy. USING limits the row to the caller's own;
-- WITH CHECK additionally pins role and chapter to their pre-edit values.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_user_role()
    AND chapter IS NOT DISTINCT FROM public.get_user_chapter()
  );
