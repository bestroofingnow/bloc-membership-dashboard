-- ============================================================
-- Migration 005: Fix infinite recursion in RLS policies
--
-- The "Admins can manage all profiles" policy on the profiles
-- table does SELECT FROM profiles to check admin status, which
-- triggers RLS on profiles again → infinite recursion.
--
-- Fix: Create SECURITY DEFINER functions that bypass RLS to
-- check user roles, then update all policies to use them.
-- ============================================================

-- ============================================
-- HELPER FUNCTIONS (bypass RLS)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_chapter_director()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'chapter_director'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_chapter()
RETURNS TEXT AS $$
  SELECT chapter FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- FIX PROFILES POLICIES (the root cause)
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
CREATE POLICY "Admins can manage all profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================
-- FIX MEMBERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all members" ON members;
CREATE POLICY "Admins can manage all members"
  ON members FOR ALL
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Directors can insert members" ON members;
CREATE POLICY "Directors can insert members"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chapter_director());

DROP POLICY IF EXISTS "Directors can update their chapter members" ON members;
CREATE POLICY "Directors can update their chapter members"
  ON members FOR UPDATE
  TO authenticated
  USING (
    public.is_chapter_director()
    AND public.get_user_chapter() = members.chapter
  );

-- ============================================
-- FIX BOARD MEMBERS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Only admins can manage board members" ON board_members;
CREATE POLICY "Only admins can manage board members"
  ON board_members FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================
-- FIX GUESTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all guests" ON guests;
CREATE POLICY "Admins can manage all guests"
  ON guests FOR ALL
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Directors can insert guests" ON guests;
CREATE POLICY "Directors can insert guests"
  ON guests FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chapter_director());

DROP POLICY IF EXISTS "Directors can update guests" ON guests;
CREATE POLICY "Directors can update guests"
  ON guests FOR UPDATE
  TO authenticated
  USING (
    public.is_chapter_director()
    AND (guests.target_chapter IS NULL OR public.get_user_chapter() = guests.target_chapter)
  );

-- ============================================
-- FIX INDUSTRY CATEGORIES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Only admins can manage categories" ON industry_categories;
CREATE POLICY "Only admins can manage categories"
  ON industry_categories FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================
-- FIX INDUSTRY TARGETS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all targets" ON industry_targets;
CREATE POLICY "Admins can manage all targets"
  ON industry_targets FOR ALL
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Directors can assign targets" ON industry_targets;
CREATE POLICY "Directors can assign targets"
  ON industry_targets FOR UPDATE
  TO authenticated
  USING (public.is_chapter_director());

-- ============================================
-- FIX BUSINESS CARD SCANS POLICIES (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'business_card_scans') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage scans" ON business_card_scans';
    EXECUTE 'CREATE POLICY "Admins can manage scans" ON business_card_scans FOR ALL TO authenticated USING (public.is_admin())';
  END IF;
END $$;
