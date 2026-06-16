-- ============================================================
-- Migration 019: Unified identity (Phase 1, spec §3)
--
-- Additive & non-destructive:
--   * members.email_normalized generated column + PLAIN index
--     (NO unique index until identity_link_audit shows 0 dups)
--   * reciprocal nullable FKs profiles.member_id / members.user_id,
--     both ON DELETE SET NULL (deactivation must not cascade-delete
--     the member row)
--   * idempotent exactly-one-match backfill (unmatched stay NULL)
--   * admin-gated identity_link_audit view (exposes emails)
--
-- Reuses the migration 005 SECURITY DEFINER helpers verbatim.
-- Does NOT touch handle_new_user, AuthGuard, or any existing policy.
-- ============================================================

-- ------------------------------------------------------------
-- 1. members.email_normalized — generated, blank/NULL never collide
-- ------------------------------------------------------------
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email_normalized TEXT
  GENERATED ALWAYS AS (NULLIF(lower(btrim(email)), '')) STORED;

-- PLAIN index only. The partial UNIQUE index is deferred to a later,
-- gated migration AFTER identity_link_audit shows 0 dup_member_email.
CREATE INDEX IF NOT EXISTS members_email_normalized_idx
  ON members (email_normalized)
  WHERE email_normalized IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Reciprocal nullable FKs (ON DELETE SET NULL)
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS member_id UUID
  REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_member_id_idx
  ON profiles (member_id) WHERE member_id IS NOT NULL;

-- One auth user maps to at most one member row.
CREATE UNIQUE INDEX IF NOT EXISTS members_user_id_uidx
  ON members (user_id) WHERE user_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Idempotent exactly-one-match backfill (guarded by IS NULL)
--    profiles.member_id <- members by normalized email,
--    ONLY when exactly one member matches.
-- ------------------------------------------------------------
UPDATE profiles p
SET member_id = sub.mid
FROM (
  SELECT m.email_normalized AS norm, MIN(m.id::text)::uuid AS mid, count(*) AS n
  FROM members m
  WHERE m.email_normalized IS NOT NULL
  GROUP BY m.email_normalized
  HAVING count(*) = 1
) sub
WHERE p.member_id IS NULL
  AND NULLIF(lower(btrim(p.email)), '') IS NOT NULL
  AND NULLIF(lower(btrim(p.email)), '') = sub.norm;

-- Reciprocally set members.user_id from the profile we just linked,
-- ONLY when that member has no user_id yet and exactly one profile
-- points at it.
UPDATE members m
SET user_id = sub.pid
FROM (
  SELECT p.member_id AS mid, MIN(p.id::text)::uuid AS pid, count(*) AS n
  FROM profiles p
  WHERE p.member_id IS NOT NULL
  GROUP BY p.member_id
  HAVING count(*) = 1
) sub
WHERE m.user_id IS NULL
  AND m.id = sub.mid;

-- ------------------------------------------------------------
-- 4. identity_link_audit — admin-gated (exposes emails)
--    Implemented as a SECURITY DEFINER function + view so the
--    admin gate is enforced server-side; never anon/member.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_link_audit()
RETURNS TABLE (
  issue   TEXT,
  ref_id  UUID,
  email   TEXT,
  detail  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Admin gate: non-admins get zero rows (no email leak).
  SELECT issue, ref_id, email, detail
  FROM (
    -- duplicate member emails (must be resolved before any unique index)
    SELECT 'dup_member_email'::text AS issue,
           m.id                     AS ref_id,
           m.email                  AS email,
           ('count=' || cnt.n::text) AS detail
    FROM members m
    JOIN (
      SELECT email_normalized, count(*) AS n
      FROM members
      WHERE email_normalized IS NOT NULL
      GROUP BY email_normalized
      HAVING count(*) > 1
    ) cnt ON cnt.email_normalized = m.email_normalized

    UNION ALL
    -- profiles with no linked member row
    SELECT 'profile_no_member', p.id, p.email, NULL
    FROM profiles p
    WHERE p.member_id IS NULL

    UNION ALL
    -- members with no linked auth user
    SELECT 'member_no_user', m.id, m.email, NULL
    FROM members m
    WHERE m.user_id IS NULL
  ) audit
  WHERE public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.identity_link_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_link_audit() TO authenticated;

CREATE OR REPLACE VIEW public.identity_link_audit AS
  SELECT * FROM public.identity_link_audit();

REVOKE ALL ON public.identity_link_audit FROM PUBLIC, anon;
GRANT SELECT ON public.identity_link_audit TO authenticated;
