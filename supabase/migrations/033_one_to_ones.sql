-- ============================================================
-- Migration 033: One-to-one ("1-2-1") meetings
-- A member logs a one-on-one with another member. Either party may log it;
-- meetings count in both directions (see src/lib/connections/oneToOne.ts).
-- Rows are visible to the two members involved (+ staff).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.one_to_ones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE, -- logger
  with_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  met_on          date NOT NULL DEFAULT current_date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id <> with_member_id)
);
CREATE INDEX IF NOT EXISTS one_to_ones_member_idx ON public.one_to_ones(member_id);
CREATE INDEX IF NOT EXISTS one_to_ones_with_idx   ON public.one_to_ones(with_member_id);

ALTER TABLE public.one_to_ones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS one_to_ones_read ON public.one_to_ones;
CREATE POLICY one_to_ones_read ON public.one_to_ones FOR SELECT TO authenticated
  USING (member_id = public.current_member_id()
         OR with_member_id = public.current_member_id()
         OR public.is_staff());
DROP POLICY IF EXISTS one_to_ones_insert ON public.one_to_ones;
CREATE POLICY one_to_ones_insert ON public.one_to_ones FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS one_to_ones_delete ON public.one_to_ones;
CREATE POLICY one_to_ones_delete ON public.one_to_ones FOR DELETE TO authenticated
  USING (member_id = public.current_member_id());
