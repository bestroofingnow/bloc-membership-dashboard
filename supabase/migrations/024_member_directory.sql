-- ============================================================
-- Migration 024: Member directory projection (Phase 1 §5.2)
--
-- Business fields (name, company, chapter, member_type, industry, title,
-- website, email, phone) are ALWAYS present. Personal fields
-- (mobile_phone, address, birthday) are non-null only when the caller is:
--   * admin/director (reuses 005 helpers), OR
--   * the owner (lower(email) = current_user_email()), OR
--   * the field is opted in via member_field_visibility.
--
-- CRITICAL INVARIANT: returns the SAME ROW COUNT as members (column-nulling
-- only, never row removal) so useMembers' data.length>0 guard holds and the
-- static fallback can never be triggered by this projection.
-- ============================================================

-- Owner self-view helper. SECURITY DEFINER + search_path pinned so it reads
-- auth.users regardless of the caller's RLS. Does NOT touch the 005 helpers.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

-- The projection. One row per member (LEFT JOIN so members without a
-- visibility row still appear — absence = all personal fields hidden).
CREATE OR REPLACE FUNCTION public.directory_members()
RETURNS TABLE (
  id UUID,
  name TEXT,
  company TEXT,
  chapter TEXT,
  member_type TEXT,
  industry TEXT,
  title TEXT,
  website TEXT,
  description TEXT,
  email TEXT,
  phone TEXT,
  industry_id UUID,
  category_id UUID,
  member_since TEXT,
  renewal_due TEXT,
  referred_by TEXT,
  mobile_phone TEXT,
  address TEXT,
  birthday TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.company,
    m.chapter,
    m.member_type,
    m.industry,
    m.title,
    m.website,
    m.description,
    m.email,
    m.phone,
    m.industry_id,
    m.category_id,
    m.member_since,
    m.renewal_due,
    m.referred_by,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_mobile_phone, FALSE)
         THEN m.mobile_phone ELSE NULL END AS mobile_phone,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_address, FALSE)
         THEN m.address ELSE NULL END AS address,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_birthday, FALSE)
         THEN m.birthday ELSE NULL END AS birthday
  FROM public.members m
  LEFT JOIN public.member_field_visibility v ON v.member_id = m.id;
$$;

-- Stable view surface for the client. Same row count as members.
CREATE OR REPLACE VIEW public.member_directory AS
  SELECT * FROM public.directory_members();

-- Only authenticated callers may read the directory. The function's
-- SECURITY DEFINER body still nulls personal columns per the rules above.
REVOKE ALL ON FUNCTION public.directory_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_members() TO authenticated;
REVOKE ALL ON public.member_directory FROM PUBLIC, anon;
GRANT SELECT ON public.member_directory TO authenticated;
