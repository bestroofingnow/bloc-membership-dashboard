-- ============================================================
-- Migration 036: Membership pipeline — real BLOC review stages + member conversion
-- Inserts the committee/board steps between "Application Received" and "Approved":
--   Membership Interview → Membership Vote → Board Vote → Approved → (convert to member)
-- and adds converted_member_id so an Approved guest can become a real member and
-- drop off the prospect board. Keeps map_kanban_stage() byte-aligned with
-- src/lib/leads/stage.ts (the three new stages stay 'applied' on the canonical funnel).
-- ============================================================

-- ---------- widen the guests.status CHECK ----------
ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS guests_status_check;
ALTER TABLE public.guests ADD CONSTRAINT guests_status_check CHECK (status IN (
  'New Lead',
  'After Hours Invited', 'After Hours Done',
  'Lunch Invited', 'Lunch Done',
  'Application Sent', 'Application Received',
  'Membership Interview', 'Membership Vote', 'Board Vote',
  'Approved', 'Declined'
));

-- ---------- track conversion of an Approved guest into a member ----------
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS converted_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- ---------- keep map_kanban_stage() in sync (new stages = still "applied") ----------
CREATE OR REPLACE FUNCTION public.map_kanban_stage(legacy_status TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE legacy_status
    WHEN 'New Lead'             THEN 'new'
    WHEN 'After Hours Invited'  THEN 'rsvp'
    WHEN 'After Hours Done'     THEN 'attended'
    WHEN 'Lunch Invited'        THEN 'attended'
    WHEN 'Lunch Done'           THEN 'attended'
    WHEN 'Application Sent'     THEN 'applied'
    WHEN 'Application Received' THEN 'applied'
    WHEN 'Membership Interview' THEN 'applied'
    WHEN 'Membership Vote'      THEN 'applied'
    WHEN 'Board Vote'           THEN 'applied'
    WHEN 'Approved'             THEN 'approved'
    WHEN 'Declined'             THEN 'declined'
    ELSE 'new'
  END
$$;
