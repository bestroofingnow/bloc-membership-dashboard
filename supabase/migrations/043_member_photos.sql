-- ============================================================
-- Migration 043: Member profile photos
-- Adds members.photo_url and threads it through member_directory (business field,
-- always visible). Creates the public `member-photos` Storage bucket. Uploads go
-- through the service-role /api/me/photo route, so no permissive Storage write
-- policy is needed — only public read for display. Recreates directory_members()
-- from migration 037 (which added ideal_referral) with the one added column.
-- ============================================================

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS photo_url text;

-- public read bucket for member photos (writes happen via service role)
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-photos', 'member-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

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
  photo_url TEXT,
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
    m.photo_url,
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
