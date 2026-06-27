-- ============================================================
-- Migration 040: 1-to-1 meeting scheduler (coffee / lunch / virtual)
-- A member proposes a meeting to another member; the invitee accepts, declines, or
-- reschedules (proposes a new time → proposed_by flips, status stays pending).
-- Visible only to the two participants (+ staff). Mirrors src/lib/meetings/invite.ts.
-- Uses the helpers from migration 032.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  to_member_id          uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  proposed_by_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('coffee','lunch','virtual')),
  proposed_at           timestamptz NOT NULL,
  location              text,
  note                  text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','accepted','declined','cancelled','completed')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (from_member_id <> to_member_id)
);
CREATE INDEX IF NOT EXISTS meeting_invites_from_idx ON public.meeting_invites(from_member_id);
CREATE INDEX IF NOT EXISTS meeting_invites_to_idx   ON public.meeting_invites(to_member_id);

ALTER TABLE public.meeting_invites ENABLE ROW LEVEL SECURITY;
-- Only the two participants (or staff) can see an invite.
DROP POLICY IF EXISTS meeting_invites_read ON public.meeting_invites;
CREATE POLICY meeting_invites_read ON public.meeting_invites FOR SELECT TO authenticated
  USING (from_member_id = public.current_member_id()
         OR to_member_id = public.current_member_id()
         OR public.is_staff());
-- You may only create an invite you are sending (and as the initial proposer).
DROP POLICY IF EXISTS meeting_invites_insert ON public.meeting_invites;
CREATE POLICY meeting_invites_insert ON public.meeting_invites FOR INSERT TO authenticated
  WITH CHECK (from_member_id = public.current_member_id()
              AND proposed_by_member_id = public.current_member_id());
-- Either participant may act on it (accept / decline / reschedule / cancel / complete).
DROP POLICY IF EXISTS meeting_invites_update ON public.meeting_invites;
CREATE POLICY meeting_invites_update ON public.meeting_invites FOR UPDATE TO authenticated
  USING (from_member_id = public.current_member_id() OR to_member_id = public.current_member_id())
  WITH CHECK (from_member_id = public.current_member_id() OR to_member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='meeting_invites') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_invites';
  END IF;
END $$;
