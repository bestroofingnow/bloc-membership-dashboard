-- ============================================================
-- Migration 041: Member-organized social events + RSVPs
-- A member hosts an informal gathering (happy hour, meal, activity, virtual) that any
-- member can RSVP to (going/maybe/declined). Distinct from the official Wild Apricot
-- `events` table. Public-read to members; host owns the event, members own their RSVP.
-- Mirrors src/lib/socials/event.ts. Uses the helpers from migration 032.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('happy_hour','meal','activity','virtual','other')),
  title           text NOT NULL,
  description     text,
  starts_at       timestamptz NOT NULL,
  location        text,
  chapter         text,                       -- null = open to all chapters
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_events_starts_idx ON public.social_events(starts_at);
CREATE INDEX IF NOT EXISTS social_events_host_idx   ON public.social_events(host_member_id);

ALTER TABLE public.social_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_events_read ON public.social_events;
CREATE POLICY social_events_read ON public.social_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS social_events_insert ON public.social_events;
CREATE POLICY social_events_insert ON public.social_events FOR INSERT TO authenticated
  WITH CHECK (host_member_id = public.current_member_id());
DROP POLICY IF EXISTS social_events_update ON public.social_events;
CREATE POLICY social_events_update ON public.social_events FOR UPDATE TO authenticated
  USING (host_member_id = public.current_member_id() OR public.is_staff())
  WITH CHECK (host_member_id = public.current_member_id() OR public.is_staff());
DROP POLICY IF EXISTS social_events_delete ON public.social_events;
CREATE POLICY social_events_delete ON public.social_events FOR DELETE TO authenticated
  USING (host_member_id = public.current_member_id() OR public.is_staff());

CREATE TABLE IF NOT EXISTS public.social_event_rsvps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.social_events(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  response    text NOT NULL DEFAULT 'going' CHECK (response IN ('going','maybe','declined')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS social_rsvps_event_idx ON public.social_event_rsvps(event_id);

ALTER TABLE public.social_event_rsvps ENABLE ROW LEVEL SECURITY;
-- Members can see who's going (read all); they manage only their own RSVP.
DROP POLICY IF EXISTS social_rsvps_read ON public.social_event_rsvps;
CREATE POLICY social_rsvps_read ON public.social_event_rsvps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS social_rsvps_insert ON public.social_event_rsvps;
CREATE POLICY social_rsvps_insert ON public.social_event_rsvps FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS social_rsvps_update ON public.social_event_rsvps;
CREATE POLICY social_rsvps_update ON public.social_event_rsvps FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS social_rsvps_delete ON public.social_event_rsvps;
CREATE POLICY social_rsvps_delete ON public.social_event_rsvps FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='social_events') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.social_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='social_event_rsvps') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.social_event_rsvps';
  END IF;
END $$;
