-- ============================================================
-- Migration 029: Live directory updates for ALL users (seamless realtime)
--
-- Problem: after 027 tightened the members table to self+staff, a realtime feed
-- on `members` only delivers each member their OWN row — so a newly added member
-- would not appear live for everyone. Also, a raw members feed would stream
-- personal PII over realtime.
--
-- Solution: a tiny PUBLIC "directory changed" signal. One singleton row whose
-- version is bumped by a trigger on every members change. Every authenticated
-- client subscribes to this row (no PII — just a counter) and refetches the
-- privacy-projected member_directory when it changes. So "when someone is added,
-- everyone sees it" — instantly, and without leaking any personal data.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.directory_version (
  id         INT PRIMARY KEY DEFAULT 1,
  version    BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT directory_version_singleton CHECK (id = 1)
);

INSERT INTO public.directory_version (id, version) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.directory_version ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user (it carries no PII). No write policy: only
-- the SECURITY DEFINER trigger / service role bumps it.
DROP POLICY IF EXISTS "directory_version_read" ON public.directory_version;
CREATE POLICY "directory_version_read"
  ON public.directory_version FOR SELECT
  TO authenticated
  USING (TRUE);

-- Bump once per statement (efficient for bulk syncs) whenever members change.
CREATE OR REPLACE FUNCTION public.bump_directory_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.directory_version SET version = version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS members_bump_directory_version ON public.members;
CREATE TRIGGER members_bump_directory_version
  AFTER INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_directory_version();

-- Stream changes to subscribed clients. Idempotent (ignore if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.directory_version;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
