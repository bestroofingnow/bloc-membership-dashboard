-- ============================================================
-- Migration 035: Member Resource Library
-- Shared links/documents members can open in-app. Members read public_visible
-- rows; directors/admins manage. v1 = external links (mirrors events.public_url).
-- See src/lib/resources/validate.ts (categories + url rules).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.resources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  description    text,
  url            text,
  category       text,
  chapter        text,                       -- null = all chapters
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  public_visible boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resources_category_idx ON public.resources(category);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resources_read ON public.resources;
CREATE POLICY resources_read ON public.resources FOR SELECT TO authenticated
  USING (public_visible OR public.is_staff());
DROP POLICY IF EXISTS resources_write ON public.resources;
CREATE POLICY resources_write ON public.resources FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='resources') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.resources';
  END IF;
END $$;
