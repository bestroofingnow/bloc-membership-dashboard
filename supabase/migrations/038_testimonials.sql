-- ============================================================
-- Migration 038: Member-to-member testimonials / endorsements
-- A member writes a public testimonial ABOUT another member (social proof shown on
-- their profile). Public-read to members; you may only write AS yourself and never
-- about yourself. Mirrors src/lib/testimonials/validate.ts. Uses the helpers from 032.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.testimonials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  subject_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (author_member_id <> subject_member_id)
);
CREATE INDEX IF NOT EXISTS testimonials_subject_idx ON public.testimonials(subject_member_id);
CREATE INDEX IF NOT EXISTS testimonials_author_idx  ON public.testimonials(author_member_id);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
-- Public social proof: any authenticated member can read all testimonials.
DROP POLICY IF EXISTS testimonials_read ON public.testimonials;
CREATE POLICY testimonials_read ON public.testimonials FOR SELECT TO authenticated USING (true);
-- You may only post AS yourself.
DROP POLICY IF EXISTS testimonials_insert ON public.testimonials;
CREATE POLICY testimonials_insert ON public.testimonials FOR INSERT TO authenticated
  WITH CHECK (author_member_id = public.current_member_id());
-- The author (or staff) may delete.
DROP POLICY IF EXISTS testimonials_delete ON public.testimonials;
CREATE POLICY testimonials_delete ON public.testimonials FOR DELETE TO authenticated
  USING (author_member_id = public.current_member_id() OR public.is_staff());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='testimonials') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.testimonials';
  END IF;
END $$;
