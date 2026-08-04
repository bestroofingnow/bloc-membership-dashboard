-- ============================================================
-- Migration 046: Unified meetings (replaces meeting_invites + one_to_ones)
-- A meeting has any number of participants (2 = a "1-on-1", 3+ = a group
-- meeting — size is derived, never stored). Two ways to create one: propose
-- ahead of time (status='proposed', organizer's row 'accepted', everyone
-- else 'pending') or log something that already happened (status=
-- 'completed', met_on set, everyone 'accepted' immediately). Only the
-- organizer may cancel. One participant declining does not cancel the
-- meeting for everyone else. Mirrors src/lib/meetings/invite.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meetings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('coffee','lunch','virtual')),
  status               text NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed','completed','cancelled')),
  proposed_at          timestamptz,
  met_on               date,
  location             text,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (proposed_at IS NOT NULL OR met_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS meetings_organizer_idx ON public.meetings(organizer_member_id);

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  meeting_id       uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  response_status  text NOT NULL DEFAULT 'pending'
                     CHECK (response_status IN ('pending','accepted','declined')),
  PRIMARY KEY (meeting_id, member_id)
);
CREATE INDEX IF NOT EXISTS meeting_participants_member_idx ON public.meeting_participants(member_id);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Visible to any participant (or staff).
DROP POLICY IF EXISTS meetings_read ON public.meetings;
CREATE POLICY meetings_read ON public.meetings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.meeting_participants p
            WHERE p.meeting_id = meetings.id AND p.member_id = public.current_member_id())
    OR public.is_staff()
  );
-- You may only create a meeting you're organizing.
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (organizer_member_id = public.current_member_id());
-- Only the organizer updates the meeting row itself (cancel/complete).
DROP POLICY IF EXISTS meetings_update ON public.meetings;
CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated
  USING (organizer_member_id = public.current_member_id())
  WITH CHECK (organizer_member_id = public.current_member_id());

DROP POLICY IF EXISTS meeting_participants_read ON public.meeting_participants;
CREATE POLICY meeting_participants_read ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.meeting_participants p2
            WHERE p2.meeting_id = meeting_participants.meeting_id AND p2.member_id = public.current_member_id())
    OR public.is_staff()
  );
-- The organizer inserts all participant rows (including their own) when creating a meeting.
DROP POLICY IF EXISTS meeting_participants_insert ON public.meeting_participants;
CREATE POLICY meeting_participants_insert ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND m.organizer_member_id = public.current_member_id())
  );
-- A participant may only update their own response.
DROP POLICY IF EXISTS meeting_participants_update ON public.meeting_participants;
CREATE POLICY meeting_participants_update ON public.meeting_participants FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='meetings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='meeting_participants') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants';
  END IF;
END $$;

-- ---------- backfill from the legacy pairwise tables ----------
-- meeting_invites -> meetings (+ 2 participant rows each)
INSERT INTO public.meetings (id, organizer_member_id, kind, status, proposed_at, created_at, updated_at, location, note)
SELECT id, proposed_by_member_id, kind,
       CASE status WHEN 'cancelled' THEN 'cancelled' WHEN 'completed' THEN 'completed' ELSE 'proposed' END,
       proposed_at, created_at, updated_at, location, note
FROM public.meeting_invites
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT id, from_member_id,
       CASE WHEN status IN ('accepted','completed') THEN 'accepted'
            WHEN status = 'declined' THEN 'declined' ELSE 'pending' END
FROM public.meeting_invites
ON CONFLICT (meeting_id, member_id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT id, to_member_id,
       CASE WHEN status IN ('accepted','completed') THEN 'accepted'
            WHEN status = 'declined' THEN 'declined' ELSE 'pending' END
FROM public.meeting_invites
ON CONFLICT (meeting_id, member_id) DO NOTHING;

-- one_to_ones -> meetings (+ 2 participant rows each), skipping any pair+date
-- already migrated above via a completed invite (avoids double-counting the
-- "Logged as a 1-to-1" conversion path, which has no direct FK back to the
-- invite it came from).
INSERT INTO public.meetings (id, organizer_member_id, kind, status, met_on, created_at, updated_at, note)
SELECT o.id, o.member_id, 'coffee', 'completed', o.met_on, o.created_at, o.created_at, o.notes
FROM public.one_to_ones o
WHERE NOT EXISTS (
  SELECT 1 FROM public.meetings m
  JOIN public.meeting_participants p1 ON p1.meeting_id = m.id AND p1.member_id = o.member_id
  JOIN public.meeting_participants p2 ON p2.meeting_id = m.id AND p2.member_id = o.with_member_id
  WHERE m.status = 'completed' AND m.met_on = o.met_on
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT o.id, o.member_id, 'accepted'
FROM public.one_to_ones o
WHERE EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = o.id)
ON CONFLICT (meeting_id, member_id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT o.id, o.with_member_id, 'accepted'
FROM public.one_to_ones o
WHERE EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = o.id)
ON CONFLICT (meeting_id, member_id) DO NOTHING;
