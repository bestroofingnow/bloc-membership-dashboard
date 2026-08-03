-- ============================================================
-- Migration 046c: Restore meeting push notifications on the new model
--
-- Migration 044's meeting_invites_notify trigger fired on the old pairwise
-- table only; nothing replaced it when 046 introduced meetings/
-- meeting_participants, so meeting-related pushes silently stopped. This
-- carries the same two notifications forward, keyed off participant rows
-- (which is where "who's invited"/"who responded" lives in the new model):
--   * INSERT of a non-organizer participant on a still-proposed meeting
--     -> "New meeting invite" to that participant.
--   * UPDATE of response_status on any participant row
--     -> "Meeting confirmed"/"Meeting update" to the organizer.
-- Same send_push() fire-and-forget mechanism as 044; no new tables/policies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_meeting_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_name text;
  kind_label text;
  organizer_id uuid;
  m_status text;
BEGIN
  SELECT organizer_member_id, status,
         CASE kind WHEN 'coffee' THEN 'coffee' WHEN 'lunch' THEN 'lunch' ELSE 'a virtual chat' END
    INTO organizer_id, m_status, kind_label
  FROM public.meetings WHERE id = NEW.meeting_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.member_id <> organizer_id AND m_status = 'proposed' THEN
      SELECT name INTO actor_name FROM public.members WHERE id = organizer_id;
      PERFORM public.send_push(NEW.member_id, 'New meeting invite',
        COALESCE(actor_name, 'A member') || ' invited you to ' || kind_label,
        jsonb_build_object('type', 'meeting', 'id', NEW.meeting_id));
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.response_status IS DISTINCT FROM OLD.response_status THEN
    SELECT name INTO actor_name FROM public.members WHERE id = NEW.member_id;
    IF NEW.response_status = 'accepted' THEN
      PERFORM public.send_push(organizer_id, 'Meeting confirmed',
        COALESCE(actor_name, 'A member') || ' accepted your ' || kind_label,
        jsonb_build_object('type', 'meeting', 'id', NEW.meeting_id));
    ELSIF NEW.response_status = 'declined' THEN
      PERFORM public.send_push(organizer_id, 'Meeting update',
        COALESCE(actor_name, 'A member') || ' can''t make ' || kind_label,
        jsonb_build_object('type', 'meeting', 'id', NEW.meeting_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS meeting_participants_notify ON public.meeting_participants;
CREATE TRIGGER meeting_participants_notify AFTER INSERT OR UPDATE OF response_status ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_participant();
