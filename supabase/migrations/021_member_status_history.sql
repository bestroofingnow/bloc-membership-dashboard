-- ============================================================
-- Migration 021: Member status & history + forward-fill triggers
-- (Phase 1, spec §3.3-3.4)
--
-- Additive & non-destructive:
--   * members.member_status default 'active' (preserves every row,
--     counts cannot drift — member_type unchanged)
--   * member_history append-only audit table, RLS via 005 helpers
--   * SEPARATE SECURITY DEFINER forward-fill triggers on profiles
--     and members; handle_new_user is NOT touched (risk #5)
-- ============================================================

-- ------------------------------------------------------------
-- 1. members.member_status — 'active' default preserves all rows
-- ------------------------------------------------------------
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_member_status_check;
ALTER TABLE members
  ADD CONSTRAINT members_member_status_check
  CHECK (member_status IN ('active','alumni','inactive'));

-- ------------------------------------------------------------
-- 2. member_history — append-only audit
--    ON DELETE CASCADE from members (history dies with the member);
--    changed_by ON DELETE SET NULL (deactivating an admin keeps history).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  change_kind  TEXT NOT NULL CHECK (change_kind IN ('chapter_change','type_change','status_change')),
  from_chapter TEXT,
  to_chapter   TEXT,
  from_type    TEXT,
  to_type      TEXT,
  from_status  TEXT,
  to_status    TEXT,
  changed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_history_member_id_idx
  ON member_history (member_id, changed_at DESC);

ALTER TABLE member_history ENABLE ROW LEVEL SECURITY;

-- Read: admin or chapter director (via 005 helpers — never inline EXISTS).
DROP POLICY IF EXISTS "member_history_read_staff" ON member_history;
CREATE POLICY "member_history_read_staff"
  ON member_history FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_chapter_director());

-- Write: admin only.
DROP POLICY IF EXISTS "member_history_write_admin" ON member_history;
CREATE POLICY "member_history_write_admin"
  ON member_history FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 3. SEPARATE forward-fill triggers (do NOT modify handle_new_user)
--    Both SECURITY DEFINER, IS NULL-guarded, single-match only,
--    order-tolerant for the invite-provisioning race.
-- ------------------------------------------------------------

-- 3a. After a profile is inserted, link it to a member by normalized
--     email when exactly one member matches; reciprocally set user_id.
CREATE OR REPLACE FUNCTION public.forward_fill_profile_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm TEXT := NULLIF(lower(btrim(NEW.email)), '');
  v_mid  UUID;
  v_cnt  INT;
BEGIN
  IF NEW.member_id IS NOT NULL OR v_norm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), MIN(id) INTO v_cnt, v_mid
  FROM public.members
  WHERE email_normalized = v_norm;

  IF v_cnt = 1 THEN
    UPDATE public.profiles SET member_id = v_mid WHERE id = NEW.id AND member_id IS NULL;
    UPDATE public.members  SET user_id   = NEW.id WHERE id = v_mid  AND user_id   IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forward_fill_profile_member_trg ON profiles;
CREATE TRIGGER forward_fill_profile_member_trg
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.forward_fill_profile_member();

-- 3b. After a member is inserted, link it to a profile (auth user) by
--     normalized email when exactly one profile matches; reciprocal.
CREATE OR REPLACE FUNCTION public.forward_fill_member_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm TEXT := NEW.email_normalized;
  v_pid  UUID;
  v_cnt  INT;
BEGIN
  IF NEW.user_id IS NOT NULL OR v_norm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), MIN(id) INTO v_cnt, v_pid
  FROM public.profiles
  WHERE NULLIF(lower(btrim(email)), '') = v_norm;

  IF v_cnt = 1 THEN
    UPDATE public.members  SET user_id   = v_pid WHERE id = NEW.id  AND user_id   IS NULL;
    UPDATE public.profiles SET member_id = NEW.id WHERE id = v_pid  AND member_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forward_fill_member_user_trg ON members;
CREATE TRIGGER forward_fill_member_user_trg
  AFTER INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION public.forward_fill_member_user();
