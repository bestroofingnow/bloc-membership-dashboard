-- ============================================================
-- Migration 034: Event attendance / self check-in
-- A member checks in at an event (ties to public.events). One row per member/event.
-- Members see their own check-ins; staff see the full roster. Aggregate per-event
-- counts are public via v_event_attendance_counts. See src/lib/attendance/*.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  checked_in_at  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS event_attendance_event_idx  ON public.event_attendance(event_id);
CREATE INDEX IF NOT EXISTS event_attendance_member_idx ON public.event_attendance(member_id);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_attendance_read ON public.event_attendance;
CREATE POLICY event_attendance_read ON public.event_attendance FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.is_staff());
DROP POLICY IF EXISTS event_attendance_insert ON public.event_attendance;
CREATE POLICY event_attendance_insert ON public.event_attendance FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='event_attendance') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_attendance';
  END IF;
END $$;

-- public per-event check-in counts (aggregate only, no member identities)
CREATE OR REPLACE VIEW public.v_event_attendance_counts AS
  SELECT event_id, count(*) AS checked_in
  FROM public.event_attendance GROUP BY event_id;
GRANT SELECT ON public.v_event_attendance_counts TO authenticated;
