-- ============================================================
-- Migration 037: "My ideal referral" member field
-- Adds members.ideal_referral (a short "who's a great intro for me" blurb) and
-- threads it through the privacy-projected member_directory so the app + the
-- Ask BLOC AI assistant can read it ("who's looking for a roofer?"). It's a
-- business field (always visible). Recreates directory_members()/member_directory
-- from migration 024 with the one added column (return-type change needs a DROP).
-- ============================================================

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS ideal_referral text;

-- The view depends on the function; drop both before changing the function's shape.
DROP VIEW IF EXISTS public.member_directory;
DROP FUNCTION IF EXISTS public.directory_members();

CREATE FUNCTION public.directory_members()
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
  ideal_referral TEXT,
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
    m.ideal_referral,
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

CREATE VIEW public.member_directory AS
  SELECT * FROM public.directory_members();

REVOKE ALL ON FUNCTION public.directory_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_members() TO authenticated;
REVOKE ALL ON public.member_directory FROM PUBLIC, anon;
GRANT SELECT ON public.member_directory TO authenticated;
