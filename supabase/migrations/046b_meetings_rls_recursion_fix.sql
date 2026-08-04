-- ============================================================
-- Migration 046b: Fix infinite recursion in meetings/meeting_participants RLS
--
-- meeting_participants_read queried meeting_participants from within its own
-- USING clause (a sibling-row lookup, "is there another row for this meeting
-- belonging to me"), and meetings_read queried meeting_participants the same
-- way — both trigger "infinite recursion detected in policy for relation"
-- (same class of bug migration 005 fixed for profiles/members). Fix: a
-- SECURITY DEFINER helper that checks participancy while bypassing RLS,
-- mirroring the existing current_member_id()/is_staff() pattern (032).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_meeting_participant(p_meeting_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND member_id = public.current_member_id()
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_meeting_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS meetings_read ON public.meetings;
CREATE POLICY meetings_read ON public.meetings FOR SELECT TO authenticated
  USING (
    public.is_meeting_participant(meetings.id)
    OR public.is_staff()
  );

DROP POLICY IF EXISTS meeting_participants_read ON public.meeting_participants;
CREATE POLICY meeting_participants_read ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    public.is_meeting_participant(meeting_participants.meeting_id)
    OR public.is_staff()
  );
