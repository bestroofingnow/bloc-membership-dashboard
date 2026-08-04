-- ============================================================
-- Migration 046a: Fix meeting_participants immutability + backfill mapping
-- Closes two defects found in task review of migration 046:
-- 1. meeting_participants_update allowed repointing meeting_id/member_id
--    via UPDATE, letting any member self-insert into meetings they were
--    never invited to (bypassing the organizer-only INSERT policy).
-- 2. The meeting_invites backfill applied the invite's shared `status`
--    column to BOTH participant rows uniformly, instead of crediting the
--    proposer's row as always 'accepted' (they proposed it) and only
--    deriving pending/accepted/declined for the other party.
-- ============================================================

-- Fix 1: make (meeting_id, member_id) immutable on meeting_participants —
-- only response_status may change via UPDATE.
CREATE OR REPLACE FUNCTION public.meeting_participants_prevent_repoint()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.meeting_id IS DISTINCT FROM OLD.meeting_id OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'meeting_id and member_id are immutable on meeting_participants';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_participants_immutable_keys ON public.meeting_participants;
CREATE TRIGGER meeting_participants_immutable_keys
  BEFORE UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.meeting_participants_prevent_repoint();

-- Fix 2: correct the backfilled response_status for meetings that came
-- from meeting_invites — the proposer's own row should be 'accepted'
-- regardless of the invite's status; only derive pending/accepted/declined
-- for the OTHER party.
UPDATE public.meeting_participants mp
SET response_status = 'accepted'
FROM public.meeting_invites mi
WHERE mp.meeting_id = mi.id
  AND mp.member_id = mi.proposed_by_member_id
  AND mp.response_status <> 'accepted';

UPDATE public.meeting_participants mp
SET response_status = CASE WHEN mi.status IN ('accepted','completed') THEN 'accepted'
                            WHEN mi.status = 'declined' THEN 'declined' ELSE 'pending' END
FROM public.meeting_invites mi
WHERE mp.meeting_id = mi.id
  AND mp.member_id = (CASE WHEN mi.proposed_by_member_id = mi.from_member_id THEN mi.to_member_id ELSE mi.from_member_id END);
