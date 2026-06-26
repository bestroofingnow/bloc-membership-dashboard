-- ============================================================
-- Migration 039: Asks & Offers board
-- A member posts an "ask" (a need: "looking for a commercial realtor") or an
-- "offer" (something they can give: "I can intro 3 lenders"); others respond with
-- a referral. Public-read to members; own-write. Mirrors src/lib/asks/validate.ts.
-- Uses the helpers from 032.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.asks_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('ask','offer')),
  title       text NOT NULL,
  body        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asks_offers_member_idx ON public.asks_offers(member_id);
CREATE INDEX IF NOT EXISTS asks_offers_status_idx ON public.asks_offers(status);

ALTER TABLE public.asks_offers ENABLE ROW LEVEL SECURITY;
-- Any authenticated member can read the board.
DROP POLICY IF EXISTS asks_offers_read ON public.asks_offers;
CREATE POLICY asks_offers_read ON public.asks_offers FOR SELECT TO authenticated USING (true);
-- Post / edit / close only your own.
DROP POLICY IF EXISTS asks_offers_insert ON public.asks_offers;
CREATE POLICY asks_offers_insert ON public.asks_offers FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS asks_offers_update ON public.asks_offers;
CREATE POLICY asks_offers_update ON public.asks_offers FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS asks_offers_delete ON public.asks_offers;
CREATE POLICY asks_offers_delete ON public.asks_offers FOR DELETE TO authenticated
  USING (member_id = public.current_member_id() OR public.is_staff());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='asks_offers') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.asks_offers';
  END IF;
END $$;
