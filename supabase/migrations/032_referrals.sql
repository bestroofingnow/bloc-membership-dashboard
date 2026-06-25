-- ============================================================
-- Migration 032: Member-to-member Referrals (+ shared RLS helpers)
-- A member GIVES a referral (a contact) to another member, who works it to closed
-- business (TYFCB) or marks it lost. Row details are private to the two members
-- involved (+ staff); aggregate stats are public via v_referral_stats.
-- Mirrors src/lib/referrals/stage.ts (stage CHECK) + stats.ts.
-- ============================================================

-- ---------- reusable helpers (used by 032/033/034) ----------
CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                 AND role IN ('admin','chapter_director'))
$$;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ---------- referrals ----------
CREATE TABLE IF NOT EXISTS public.referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  to_member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  contact_name    text,
  contact_company text,
  contact_phone   text,
  contact_email   text,
  description     text,
  stage           text NOT NULL DEFAULT 'given'
                    CHECK (stage IN ('given','contacted','met','closed','lost')),
  closed_value    numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_from_idx ON public.referrals(from_member_id);
CREATE INDEX IF NOT EXISTS referrals_to_idx   ON public.referrals(to_member_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_read ON public.referrals;
CREATE POLICY referrals_read ON public.referrals FOR SELECT TO authenticated
  USING (from_member_id = public.current_member_id()
         OR to_member_id = public.current_member_id()
         OR public.is_staff());
DROP POLICY IF EXISTS referrals_insert ON public.referrals;
CREATE POLICY referrals_insert ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (from_member_id = public.current_member_id());
DROP POLICY IF EXISTS referrals_update ON public.referrals;
CREATE POLICY referrals_update ON public.referrals FOR UPDATE TO authenticated
  USING (from_member_id = public.current_member_id()
         OR to_member_id = public.current_member_id() OR public.is_staff())
  WITH CHECK (from_member_id = public.current_member_id()
              OR to_member_id = public.current_member_id() OR public.is_staff());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referrals') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals';
  END IF;
END $$;

-- ---------- aggregate stats (owner view = bypasses row RLS; exposes only counts/$,
-- never contact details — fine for a chapter leaderboard) ----------
CREATE OR REPLACE VIEW public.v_referral_stats AS
  SELECT m.id AS member_id, m.name, m.chapter,
    (SELECT count(*) FROM public.referrals r WHERE r.from_member_id = m.id) AS given,
    (SELECT count(*) FROM public.referrals r WHERE r.to_member_id = m.id)   AS received,
    (SELECT count(*) FROM public.referrals r WHERE r.from_member_id = m.id AND r.stage='closed') AS closed,
    (SELECT coalesce(sum(r.closed_value),0) FROM public.referrals r
       WHERE r.from_member_id = m.id AND r.stage='closed') AS closed_value
  FROM public.members m;
GRANT SELECT ON public.v_referral_stats TO authenticated;
