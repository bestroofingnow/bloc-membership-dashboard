-- ============================================================
-- Migration 047: Connections (people met, not yet ready to refer)
-- A member logs a connection; it may later source one or more referrals
-- (referrals.source_connection_id, many-to-one — one connection can produce
-- several referrals over time). Archiving a connection does not affect
-- referrals already linked to it (ON DELETE SET NULL, not CASCADE).
-- Same RLS shape as referrals: owned by member_id, readable/writable only
-- by that member (+ staff).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  contact_name  text NOT NULL,
  company       text,
  email         text,
  phone         text,
  notes         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connections_member_idx ON public.connections(member_id);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connections_read ON public.connections;
CREATE POLICY connections_read ON public.connections FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.is_staff());
DROP POLICY IF EXISTS connections_insert ON public.connections;
CREATE POLICY connections_insert ON public.connections FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS connections_update ON public.connections;
CREATE POLICY connections_update ON public.connections FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='connections') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.connections';
  END IF;
END $$;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS source_connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL;
