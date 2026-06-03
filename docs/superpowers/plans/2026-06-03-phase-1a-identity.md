# Phase 1 — Unified Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one durable, non-destructive link per human (`auth.users` ↔ `profiles` ↔ `members`) via reciprocal nullable FKs, a normalized-email backfill, append-only member status history, and separate forward-fill triggers — without changing the live email-match read path until a clearly-gated later cutover slice.

**Architecture:** Migration `019_identity.sql` adds `members.email_normalized` (generated column + plain index only), reciprocal nullable `profiles.member_id`/`members.user_id` FKs (all `ON DELETE SET NULL`), an exactly-one-match idempotent backfill, and an admin-gated `identity_link_audit` view. Migration `021_member_status_history.sql` adds `members.member_status` (defaulting `'active'` to preserve all rows), an append-only `member_history` table with `005`-helper RLS, and **separate** `SECURITY DEFINER` forward-fill triggers on `profiles`/`members` (never touching `handle_new_user`). Migration `020` is the RESERVED, separately-shipped reader-cutover slice that flips `useMyMember` + `/api/me/roster-visibility` to FK-first-with-email-fallback, gated on `identity_link_audit` being clean.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Supabase (Postgres + RLS), Tailwind, vitest. Supabase project ref ksmtkisknnvrjdfigsll.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/019_identity.sql` | Create | `email_normalized` generated column + **plain** index; reciprocal nullable FKs (`profiles.member_id`, `members.user_id`) all `ON DELETE SET NULL`; unique index on `members.user_id WHERE user_id IS NOT NULL`; exactly-one-match idempotent backfill; admin-gated `identity_link_audit` view + RLS-safe wrapper. **No** unique index on `email_normalized` yet. |
| `src/lib/identity/normalize-email.ts` | Create | Pure TS mirror of the SQL `email_normalized` rule (`NULLIF(lower(btrim(email)),'')`), so client/server code that compares against the column matches Postgres exactly. Unit-tested. |
| `src/lib/identity/normalize-email.test.ts` | Create | vitest unit tests for `normalizeEmail()`. |
| `supabase/migrations/021_member_status_history.sql` | Create | `members.member_status` (`active`/`alumni`/`inactive`, default `'active'`); append-only `member_history` table + RLS via `005` helpers; **separate** `SECURITY DEFINER` `AFTER INSERT` forward-fill triggers on `profiles` and `members`. |
| `src/lib/identity/status.ts` | Create | Pure helpers: `MemberStatus` type, `isValidMemberStatus()`, `nextStatusChange()` (computes the `change_kind` + from/to fields for a convert-in-place mutation, used by the eventual admin write path and unit-tested now). |
| `src/lib/identity/status.test.ts` | Create | vitest unit tests for `status.ts`. |
| `supabase/migrations/020_identity_reader_cutover.sql` | Create (RESERVED — later, gated task) | Documentation-only / verification migration anchoring the reader-cutover slice in the sequence (no schema change; records the cutover sentinel in `dashboard_settings` after audit is clean). |
| `src/lib/identity/resolve-member.ts` | Create (later cutover task) | Pure helper deciding FK-first-vs-email-fallback selection inputs, unit-tested. |
| `src/lib/identity/resolve-member.test.ts` | Create (later cutover task) | vitest tests for the resolver decision. |
| `src/hooks/useMyMember.ts` | Modify (later cutover task) | Lines 44-49: FK-first (`members.user_id = session.user.id`), email-fallback. |
| `src/app/api/me/roster-visibility/route.ts` | Modify (later cutover task) | Lines 42-48: FK-first lookup by `user_id`, email fallback. |

> Migrations `017` (scanner) and `018` (events reconcile) and the `008` stray-token fix are owned by the **Phase 0** workstream and are prerequisites (see "Done when"); this plan does **not** recreate them. Per spec §3 "Reconciliation note", this workstream adds **no** `member_id` columns to `guests`/`public_signups`/`intake_guests` (that linkage is owned by the lead-funnel `022`).

---

## TASK 1 — Pure email-normalization helper (mirrors the SQL generated column)

**Why first:** Every later comparison ("does this profile email match exactly one member?") must produce the **same** result as Postgres' `email_normalized` generated column, or the backfill and the eventual reader cutover will disagree with the DB. We pin the rule in a tested pure function before writing any SQL.

**Files**
- Create `src/lib/identity/normalize-email.test.ts`
- Create `src/lib/identity/normalize-email.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create `src/lib/identity/normalize-email.test.ts` with the FULL contents:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { normalizeEmail } from './normalize-email';

  describe('normalizeEmail()', () => {
    test('lowercases and trims', () => {
      expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
    });

    test('collapses blank/whitespace-only to null (never collides)', () => {
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail('   ')).toBeNull();
      expect(normalizeEmail('\t\n')).toBeNull();
    });

    test('null and undefined collapse to null', () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail(undefined)).toBeNull();
    });

    test('preserves internal characters, trims only edges', () => {
      expect(normalizeEmail('a b@x.com')).toBe('a b@x.com');
      expect(normalizeEmail('  a@b.co  ')).toBe('a@b.co');
    });

    test('matches the Postgres rule NULLIF(lower(btrim(email)),"")', () => {
      // btrim trims leading/trailing spaces; lower lowercases; NULLIF empties->null
      expect(normalizeEmail(' MEMBER@BLOC.COM')).toBe('member@bloc.com');
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL.** Run:
  ```
  npm test -- src/lib/identity/normalize-email.test.ts
  ```
  Expect failure with a message like `Error: Failed to load url ./normalize-email` / `Cannot find module './normalize-email'` (the implementation file does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `src/lib/identity/normalize-email.ts` with the FULL contents:
  ```ts
  /**
   * Mirror of the Postgres generated column:
   *   members.email_normalized = NULLIF(lower(btrim(email)), '')
   * Use this anywhere TS compares an email against members.email_normalized,
   * so client/server logic matches the database byte-for-byte.
   */
  export function normalizeEmail(email: string | null | undefined): string | null {
    if (email == null) return null;
    const trimmed = email.trim().toLowerCase();
    return trimmed === '' ? null : trimmed;
  }
  ```

- [ ] **Step 4: Run the test, expect PASS.** Run:
  ```
  npm test -- src/lib/identity/normalize-email.test.ts
  ```
  Expect all 5 assertions green (`5 passed`).

- [ ] **Step 5: Commit.** Run:
  ```
  git add "src/lib/identity/normalize-email.ts" "src/lib/identity/normalize-email.test.ts"
  git commit -m "feat(identity): add pure normalizeEmail mirroring SQL email_normalized rule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## TASK 2 — Baseline reconnaissance & count snapshots (red-team risks #2, #9)

**Why:** The spec (§7 sequencing, §8 checks 8 & 9) requires pre/post row counts identical and `identity_link_audit` to show **0** `dup_member_email` **before** any uniqueness is enforced. We capture the baseline now so every later step is verifiable against a real DB-only fingerprint. **No schema changes in this task.**

**Files** — none (read-only SQL run via the Supabase MCP `execute_sql` against project `ksmtkisknnvrjdfigsll`).

**Steps**

- [ ] **Step 1: Confirm the project ref and helper signatures are intact.** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT proname, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc
  WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter','handle_new_user')
  ORDER BY proname;
  ```
  Expect exactly four rows: `get_user_chapter()`, `handle_new_user()`, `is_admin()`, `is_chapter_director()`. Record this output — Go/No-Go check 10 compares against it later.

- [ ] **Step 2: Snapshot baseline row counts.** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    (SELECT count(*) FROM members)          AS members,
    (SELECT count(*) FROM profiles)         AS profiles,
    (SELECT count(*) FROM guests)           AS guests,
    (SELECT count(*) FROM public_signups)   AS public_signups,
    (SELECT count(*) FROM intake_guests)    AS intake_guests;
  ```
  Record the five integers verbatim as the "Phase-0 snapshot" referenced by Go/No-Go check 8 & 9.

- [ ] **Step 3: Snapshot the canonical count fingerprint (check 8).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    count(*) FILTER (WHERE member_type = 'full')                          AS full_members,
    count(*) FILTER (WHERE member_type = 'after_hours')                   AS after_hours,
    count(*) FILTER (WHERE member_type = 'full' AND chapter = 'North')    AS north,
    count(*) FILTER (WHERE member_type = 'full' AND chapter = 'South')    AS south,
    count(*) FILTER (WHERE member_type = 'full' AND chapter = 'Uptown')   AS uptown,
    count(*) FILTER (WHERE member_type = 'full' AND chapter = 'FLOC')     AS floc,
    count(*) FILTER (WHERE member_type = 'full' AND chapter = 'Alumni')   AS alumni
  FROM members;
  ```
  Record all seven integers. These must be **identical** post-migration (check 8 — `member_status` defaults `'active'`, so counts cannot drift).

- [ ] **Step 4: Enumerate duplicate normalized emails (risk #2).** Run via Supabase MCP `execute_sql` (this reproduces the future generated-column rule without creating it):
  ```sql
  SELECT NULLIF(lower(btrim(email)), '') AS norm, count(*) AS n
  FROM members
  WHERE NULLIF(lower(btrim(email)), '') IS NOT NULL
  GROUP BY 1
  HAVING count(*) > 1
  ORDER BY n DESC;
  ```
  Record the result. **If zero rows** → safe to plan the `email_normalized` plain index now and the partial UNIQUE later. **If non-zero** → these are the `dup_member_email` rows that MUST be human-resolved (spec §10.4) before any unique index; flag them but DO NOT block the `019` migration (it only adds a plain index).

- [ ] **Step 5: Record the reconnaissance.** Paste the four outputs (Steps 1-4) into the task's notes / PR description as the "Identity baseline" block. No commit (read-only). This block is the evidence used by Go/No-Go checks 8, 9, 10.

---

## TASK 3 — Migration 019: `email_normalized`, reciprocal FKs, backfill, audit view

**Files**
- Create `supabase/migrations/019_identity.sql`

**Ordering constraints baked in (spec §3.1, §7):**
- `email_normalized` gets a **plain** index only — never a UNIQUE index in this migration (risk #2).
- All new FKs are nullable and `ON DELETE SET NULL` (risk #8).
- Backfill links **only on exactly-one-match** (risk #2); unmatched rows stay NULL (nothing deleted).
- The audit view exposes emails → it is **admin-gated**, never anon/member (spec §3.1).
- Helpers `is_admin()`/`is_chapter_director()`/`get_user_chapter()` are **called**, never redefined (risk #5).

**Steps**

- [ ] **Step 1: Author the migration file.** Create `supabase/migrations/019_identity.sql` with the FULL contents:
  ```sql
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
    SELECT m.email_normalized AS norm, MIN(m.id) AS mid, count(*) AS n
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
    SELECT p.member_id AS mid, MIN(p.id) AS pid, count(*) AS n
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
  ```

- [ ] **Step 2: Apply the migration.** Apply `019_identity.sql` to project `ksmtkisknnvrjdfigsll` via Supabase MCP `apply_migration` (name `019_identity`). Expect success with no error.

- [ ] **Step 3: Verify the generated column + plain index (NOT unique).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    (SELECT count(*) FROM information_schema.columns
       WHERE table_name='members' AND column_name='email_normalized') AS has_col,
    (SELECT indexdef FROM pg_indexes
       WHERE tablename='members' AND indexname='members_email_normalized_idx') AS idx_def;
  ```
  Expect `has_col = 1` and `idx_def` containing `CREATE INDEX` (NOT `CREATE UNIQUE INDEX`). **If `idx_def` says UNIQUE, this is a No-Go (risk #2) — fix before proceeding.**

- [ ] **Step 4: Verify FK delete rules are `SET NULL` (risk #8).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT conname, confdeltype
  FROM pg_constraint
  WHERE conname IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid IN ('profiles'::regclass,'members'::regclass)
      AND contype='f'
      AND (conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='profiles'::regclass AND attname='member_id')]
        OR conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='members'::regclass  AND attname='user_id')])
  );
  ```
  Expect both new constraints with `confdeltype = 'n'` (`n` = SET NULL). Any `c` (CASCADE) or `a` (NO ACTION) on these two is a No-Go.

- [ ] **Step 5: Verify counts unchanged (check 9) and backfill is exactly-one-match.** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    (SELECT count(*) FROM members)  AS members_after,
    (SELECT count(*) FROM profiles) AS profiles_after,
    (SELECT count(*) FROM profiles WHERE member_id IS NOT NULL) AS profiles_linked,
    (SELECT count(*) FROM members  WHERE user_id  IS NOT NULL) AS members_linked,
    (SELECT count(*) FROM (
       SELECT email_normalized FROM members
       WHERE email_normalized IS NOT NULL
       GROUP BY email_normalized HAVING count(*) > 1) d) AS dup_emails;
  ```
  Expect `members_after`/`profiles_after` **identical** to the Task 2 snapshot. `profiles_linked`/`members_linked` ≥ 0 (no error). Record `dup_emails` — it must be `0` before any later unique index.

- [ ] **Step 6: Verify the audit view is admin-gated (no email leak).** Run via Supabase MCP `execute_sql` (the MCP runs as service-role/postgres, where `is_admin()` is false because `auth.uid()` is NULL → the gate yields **zero rows**, proving the gate is wired):
  ```sql
  SELECT count(*) AS rows_for_non_admin_context FROM identity_link_audit;
  ```
  Expect `0` (the `WHERE public.is_admin()` gate returns nothing for a non-authenticated context). Also confirm the grant: anon has no SELECT — run:
  ```sql
  SELECT has_table_privilege('anon','identity_link_audit','SELECT') AS anon_can_read;
  ```
  Expect `anon_can_read = false`.

- [ ] **Step 7: Verify deactivation leaves the member row intact (risk #8 functional test).** Run via Supabase MCP `execute_sql` inside a rolled-back transaction so prod is untouched:
  ```sql
  BEGIN;
  -- pick any linked pair
  WITH pick AS (
    SELECT m.id AS mid, m.user_id AS uid, p.id AS pid
    FROM members m JOIN profiles p ON p.member_id = m.id
    WHERE m.user_id IS NOT NULL LIMIT 1
  )
  SELECT mid, uid, pid FROM pick \gset
  -- simulate deleting the profile row (deactivation contract)
  DELETE FROM profiles WHERE id = (SELECT pid FROM (SELECT :'pid'::uuid AS pid) z);
  -- member must still exist; its user_id is set NULL by ON DELETE SET NULL
  SELECT
    (SELECT count(*) FROM members WHERE id = :'mid') AS member_still_present,
    (SELECT user_id FROM members WHERE id = :'mid')  AS member_user_id_after;
  ROLLBACK;
  ```
  Expect `member_still_present = 1` and `member_user_id_after` NULL (proving SET NULL, not CASCADE). If the MCP cannot use `\gset`, substitute concrete UUIDs from a prior `SELECT` and keep the `BEGIN`/`ROLLBACK` wrapper. **Member row surviving is mandatory.**

- [ ] **Step 8: Commit.** Run:
  ```
  git add "supabase/migrations/019_identity.sql"
  git commit -m "feat(identity): migration 019 — email_normalized, reciprocal nullable FKs, exactly-one-match backfill, admin-gated audit

- email_normalized generated column + PLAIN index only (no unique until dups clean)
- profiles.member_id / members.user_id reciprocal FKs, ON DELETE SET NULL
- idempotent exactly-one-match backfill, unmatched rows stay NULL
- identity_link_audit admin-gated (no email leak to anon/member)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## TASK 4 — Pure member-status helpers (convert-in-place semantics)

**Why:** §3.3 requires "convert-in-place": a chapter change, After Hours→full, or Alumni transition mutates the single `members` row and appends one `member_history` event. The decision of which `change_kind` and which from/to fields to record is pure logic — we extract and test it now, so the eventual admin write path and the `021` trigger contract are pinned.

**Files**
- Create `src/lib/identity/status.test.ts`
- Create `src/lib/identity/status.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create `src/lib/identity/status.test.ts` with the FULL contents:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { isValidMemberStatus, nextStatusChange } from './status';

  describe('isValidMemberStatus()', () => {
    test('accepts the three canonical statuses', () => {
      expect(isValidMemberStatus('active')).toBe(true);
      expect(isValidMemberStatus('alumni')).toBe(true);
      expect(isValidMemberStatus('inactive')).toBe(true);
    });
    test('rejects anything else', () => {
      expect(isValidMemberStatus('full')).toBe(false);
      expect(isValidMemberStatus('')).toBe(false);
      expect(isValidMemberStatus('ACTIVE')).toBe(false);
    });
  });

  describe('nextStatusChange() — convert-in-place', () => {
    test('chapter change emits chapter_change with from/to chapter', () => {
      const c = nextStatusChange(
        { chapter: 'North', memberType: 'full', status: 'active' },
        { chapter: 'South' },
      );
      expect(c).toEqual({
        change_kind: 'chapter_change',
        from_chapter: 'North', to_chapter: 'South',
        from_type: null, to_type: null,
        from_status: null, to_status: null,
      });
    });

    test('After Hours -> full emits type_change', () => {
      const c = nextStatusChange(
        { chapter: null, memberType: 'after_hours', status: 'active' },
        { memberType: 'full', chapter: 'Uptown' },
      );
      expect(c).toEqual({
        change_kind: 'type_change',
        from_chapter: null, to_chapter: 'Uptown',
        from_type: 'after_hours', to_type: 'full',
        from_status: null, to_status: null,
      });
    });

    test('moving to alumni emits status_change', () => {
      const c = nextStatusChange(
        { chapter: 'FLOC', memberType: 'full', status: 'active' },
        { status: 'alumni' },
      );
      expect(c).toEqual({
        change_kind: 'status_change',
        from_chapter: null, to_chapter: null,
        from_type: null, to_type: null,
        from_status: 'active', to_status: 'alumni',
      });
    });

    test('a no-op change returns null (no history row)', () => {
      const c = nextStatusChange(
        { chapter: 'North', memberType: 'full', status: 'active' },
        { chapter: 'North' },
      );
      expect(c).toBeNull();
    });

    test('rejects an invalid target status by throwing', () => {
      expect(() => nextStatusChange(
        { chapter: 'North', memberType: 'full', status: 'active' },
        { status: 'gone' as unknown as 'inactive' },
      )).toThrow(/invalid member_status/);
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL.** Run:
  ```
  npm test -- src/lib/identity/status.test.ts
  ```
  Expect failure: `Cannot find module './status'`.

- [ ] **Step 3: Write the minimal implementation.** Create `src/lib/identity/status.ts` with the FULL contents:
  ```ts
  import type { ChapterName } from '@/types';

  export type MemberStatus = 'active' | 'alumni' | 'inactive';
  export type MemberType = 'full' | 'after_hours';

  const VALID_STATUSES: readonly MemberStatus[] = ['active', 'alumni', 'inactive'];

  export function isValidMemberStatus(s: string): s is MemberStatus {
    return (VALID_STATUSES as readonly string[]).includes(s);
  }

  export interface MemberStateBefore {
    chapter: ChapterName | null;
    memberType: MemberType;
    status: MemberStatus;
  }

  export interface MemberStatePatch {
    chapter?: ChapterName | null;
    memberType?: MemberType;
    status?: MemberStatus;
  }

  export interface MemberHistoryChange {
    change_kind: 'chapter_change' | 'type_change' | 'status_change';
    from_chapter: ChapterName | null;
    to_chapter: ChapterName | null;
    from_type: MemberType | null;
    to_type: MemberType | null;
    from_status: MemberStatus | null;
    to_status: MemberStatus | null;
  }

  /**
   * Convert-in-place: given the current member state and a patch, return the
   * single member_history row to append, or null if nothing changed.
   * Precedence: status change > type change > chapter change (one row per call).
   */
  export function nextStatusChange(
    before: MemberStateBefore,
    patch: MemberStatePatch,
  ): MemberHistoryChange | null {
    if (patch.status !== undefined && !isValidMemberStatus(patch.status)) {
      throw new Error(`invalid member_status: ${String(patch.status)}`);
    }

    const statusChanged = patch.status !== undefined && patch.status !== before.status;
    const typeChanged = patch.memberType !== undefined && patch.memberType !== before.memberType;
    const chapterChanged = patch.chapter !== undefined && patch.chapter !== before.chapter;

    if (statusChanged) {
      return {
        change_kind: 'status_change',
        from_chapter: null, to_chapter: null,
        from_type: null, to_type: null,
        from_status: before.status, to_status: patch.status!,
      };
    }
    if (typeChanged) {
      return {
        change_kind: 'type_change',
        from_chapter: before.chapter,
        to_chapter: patch.chapter !== undefined ? patch.chapter : before.chapter,
        from_type: before.memberType, to_type: patch.memberType!,
        from_status: null, to_status: null,
      };
    }
    if (chapterChanged) {
      return {
        change_kind: 'chapter_change',
        from_chapter: before.chapter, to_chapter: patch.chapter!,
        from_type: null, to_type: null,
        from_status: null, to_status: null,
      };
    }
    return null;
  }
  ```

- [ ] **Step 4: Run the test, expect PASS.** Run:
  ```
  npm test -- src/lib/identity/status.test.ts
  ```
  Expect all assertions green.

- [ ] **Step 5: Commit.** Run:
  ```
  git add "src/lib/identity/status.ts" "src/lib/identity/status.test.ts"
  git commit -m "feat(identity): pure convert-in-place member-status helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## TASK 5 — Migration 021: `member_status`, append-only `member_history`, separate forward-fill triggers

**Files**
- Create `supabase/migrations/021_member_status_history.sql`

**Ordering constraints baked in (spec §3.3, §3.4, §7):**
- `member_status` defaults `'active'` so **every existing row is preserved and counts cannot drift** (check 8/9, risk #9).
- `member_history` is append-only; RLS read = admin/director via `005` helpers, write = admin-only.
- Forward-fill triggers are **separate** `SECURITY DEFINER` functions, `IS NULL`-guarded, order-tolerant; `handle_new_user` is **not** modified (risk #5).

**Steps**

- [ ] **Step 1: Author the migration file.** Create `supabase/migrations/021_member_status_history.sql` with the FULL contents:
  ```sql
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
  ```

- [ ] **Step 2: Apply the migration.** Apply `021_member_status_history.sql` to project `ksmtkisknnvrjdfigsll` via Supabase MCP `apply_migration` (name `021_member_status_history`). Expect success.

- [ ] **Step 3: Verify counts unchanged + all rows default `'active'` (check 8/9, risk #9).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT
    (SELECT count(*) FROM members) AS members_after,
    count(*) FILTER (WHERE member_status = 'active')                      AS active,
    count(*) FILTER (WHERE member_type = 'full')                         AS full_members,
    count(*) FILTER (WHERE member_type = 'after_hours')                  AS after_hours,
    count(*) FILTER (WHERE member_type='full' AND chapter='North')       AS north,
    count(*) FILTER (WHERE member_type='full' AND chapter='South')       AS south,
    count(*) FILTER (WHERE member_type='full' AND chapter='Uptown')      AS uptown,
    count(*) FILTER (WHERE member_type='full' AND chapter='FLOC')        AS floc,
    count(*) FILTER (WHERE member_type='full' AND chapter='Alumni')      AS alumni
  FROM members;
  ```
  Expect `members_after = active` (every row defaulted `'active'`) and `full_members/after_hours/north/south/uptown/floc/alumni` **identical** to the Task 2 / Task 3 snapshot. Any delta is a regression (No-Go).

- [ ] **Step 4: Verify `handle_new_user` is byte-for-byte unchanged (risk #5).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT pg_get_functiondef('public.handle_new_user'::regproc) AS def;
  ```
  Expect the body to still `INSERT INTO public.profiles (id, email, full_name, role) VALUES (..., 'member')` exactly as migration `001:97-115` — i.e. NO forward-fill logic added inside it. The forward-fill must live only in the two new `AFTER INSERT` triggers.

- [ ] **Step 5: Verify `member_history` RLS uses the `005` helpers (no inlined profiles self-select).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
         pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy
  WHERE polrelid = 'member_history'::regclass
  ORDER BY polname;
  ```
  Expect `member_history_read_staff` USING `(is_admin() OR is_chapter_director())` and `member_history_write_admin` USING/CHECK `is_admin()` — and **no** `SELECT 1 FROM profiles` substring (which would re-trigger the `005` recursion).

- [ ] **Step 6: Verify the forward-fill triggers are separate and SECURITY DEFINER.** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT t.tgname, p.proname, p.prosecdef
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgname IN ('forward_fill_profile_member_trg','forward_fill_member_user_trg')
    AND NOT t.tgisinternal;
  ```
  Expect two rows, both `prosecdef = true`, function names `forward_fill_profile_member` / `forward_fill_member_user` (distinct from `handle_new_user`).

- [ ] **Step 7: Functional test — forward-fill on a new member, idempotent & order-tolerant (rolled back).** Run via Supabase MCP `execute_sql`:
  ```sql
  BEGIN;
  -- Take an existing profile whose member_id is NULL but whose email matches
  -- no member yet, then insert a member with that email -> trigger should link.
  WITH cand AS (
    SELECT p.id AS pid, p.email
    FROM profiles p
    WHERE p.member_id IS NULL
      AND NULLIF(lower(btrim(p.email)),'') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM members m WHERE m.email_normalized = NULLIF(lower(btrim(p.email)),'')
      )
    LIMIT 1
  )
  INSERT INTO members (name, company, chapter, industry, email)
  SELECT 'FP Test', 'FP Co', 'North', 'Test', email FROM cand
  RETURNING id, user_id;
  -- After insert, the new member should have user_id set to the matching profile,
  -- and that profile should now have member_id set.
  SELECT
    (SELECT count(*) FROM members  WHERE name='FP Test' AND user_id IS NOT NULL)  AS member_linked,
    (SELECT count(*) FROM profiles WHERE member_id = (SELECT id FROM members WHERE name='FP Test')) AS profile_linked;
  ROLLBACK;
  ```
  Expect `member_linked = 1` and `profile_linked = 1` when a candidate exists (proving forward-fill). If the CTE finds no candidate (0 rows inserted), the trigger is still proven by Step 6; note "no candidate" and move on.

- [ ] **Step 8: Commit.** Run:
  ```
  git add "supabase/migrations/021_member_status_history.sql"
  git commit -m "feat(identity): migration 021 — member_status default active, append-only member_history, separate forward-fill triggers

- member_status NOT NULL DEFAULT 'active' (counts cannot drift)
- member_history append-only, RLS via 005 helpers (read staff, write admin)
- SECURITY DEFINER forward-fill triggers on profiles + members, IS NULL-guarded
- handle_new_user untouched

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## TASK 6 — Identity baseline Go/No-Go gate for the reader cutover

**Why:** Migration `020` (the reader cutover) may ship **only** after `identity_link_audit` is clean for active users and `dup_member_email = 0` (spec §3.5, §7, risk #2). This task is the explicit gate that produces the green/red signal; it ships **no code** and blocks Task 7/8 until green.

**Files** — none (verification only).

**Steps**

- [ ] **Step 1: Assert zero duplicate member emails (hard gate for cutover).** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT count(*) AS dup_member_email
  FROM (
    SELECT email_normalized FROM members
    WHERE email_normalized IS NOT NULL
    GROUP BY email_normalized HAVING count(*) > 1
  ) d;
  ```
  Expect `0`. **If non-zero**: STOP. The `dup_member_email` rows must be human-resolved (spec §10.4) before Task 7/8. Record the count.

- [ ] **Step 2: Assert every previously-email-resolvable active member now resolves by FK.** Run via Supabase MCP `execute_sql`:
  ```sql
  -- Active members that have a matching profile by email but are NOT yet FK-linked.
  -- These would silently disappear under FK-first reads -> must be 0 (or explained).
  SELECT count(*) AS active_members_email_match_but_no_fk
  FROM members m
  JOIN profiles p
    ON NULLIF(lower(btrim(p.email)),'') = m.email_normalized
  WHERE m.member_status = 'active'
    AND m.email_normalized IS NOT NULL
    AND m.user_id IS NULL;
  ```
  Expect `0`. This is the §8 check-9 condition: "every member that resolved via the old `ilike` path still resolves." A non-zero count means the FK-first path would lose those readers — the email-fallback (Task 7) covers them, but record the number so the cutover keeps the fallback branch until this is 0.

- [ ] **Step 2b: Confirm the cutover keeps a fallback for non-zero residue.** If Step 2 returned non-zero, confirm in writing that Task 7/8 ship FK-first **with** email-fallback (they do by design) and do **not** remove the email branch. The email-branch removal is the deferred third slice (spec §3.5, out of scope here).

- [ ] **Step 3: Record the gate result.** Paste Step 1 and Step 2 outputs into the PR/task notes as "Cutover gate". **Go for Task 7/8** only if Step 1 == 0. Otherwise mark Task 7/8 BLOCKED.

---

## TASK 7 (RESERVED, gated) — Pure FK-first-with-email-fallback resolver + migration 020 anchor

**Why this is separate (spec §3.5, §6 line 130):** Migration `020` is the reserved reader-cutover slice and ships as its **own PR**, after Task 6's gate is green. This task introduces the pure decision logic and the `020` anchor migration; Task 8 wires the two readers.

**Files**
- Create `src/lib/identity/resolve-member.test.ts`
- Create `src/lib/identity/resolve-member.ts`
- Create `supabase/migrations/020_identity_reader_cutover.sql`

**Steps**

- [ ] **Step 1: Write the failing test.** Create `src/lib/identity/resolve-member.test.ts` with the FULL contents:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { pickMemberLookup } from './resolve-member';

  describe('pickMemberLookup() — FK-first, email-fallback', () => {
    test('uses user_id when a session user id is present', () => {
      expect(pickMemberLookup({ userId: 'uid-1', email: 'a@b.com' })).toEqual({
        by: 'user_id', value: 'uid-1',
      });
    });

    test('falls back to normalized email when no user id', () => {
      expect(pickMemberLookup({ userId: null, email: '  A@B.com ' })).toEqual({
        by: 'email', value: 'a@b.com',
      });
    });

    test('returns none when neither user id nor a usable email exists', () => {
      expect(pickMemberLookup({ userId: null, email: '   ' })).toEqual({ by: 'none' });
      expect(pickMemberLookup({ userId: null, email: null })).toEqual({ by: 'none' });
    });

    test('empty-string userId is treated as absent and falls back to email', () => {
      expect(pickMemberLookup({ userId: '', email: 'x@y.com' })).toEqual({
        by: 'email', value: 'x@y.com',
      });
    });
  });
  ```

- [ ] **Step 2: Run the test, expect FAIL.** Run:
  ```
  npm test -- src/lib/identity/resolve-member.test.ts
  ```
  Expect `Cannot find module './resolve-member'`.

- [ ] **Step 3: Write the minimal implementation.** Create `src/lib/identity/resolve-member.ts` with the FULL contents:
  ```ts
  import { normalizeEmail } from './normalize-email';

  export type MemberLookup =
    | { by: 'user_id'; value: string }
    | { by: 'email'; value: string }
    | { by: 'none' };

  /**
   * FK-first, email-fallback (spec §3.5).
   * Prefer members.user_id = session user id; otherwise fall back to the
   * normalized email match. Returns { by: 'none' } when neither is usable.
   */
  export function pickMemberLookup(input: {
    userId: string | null | undefined;
    email: string | null | undefined;
  }): MemberLookup {
    const uid = (input.userId ?? '').trim();
    if (uid !== '') return { by: 'user_id', value: uid };
    const norm = normalizeEmail(input.email);
    if (norm !== null) return { by: 'email', value: norm };
    return { by: 'none' };
  }
  ```

- [ ] **Step 4: Run the test, expect PASS.** Run:
  ```
  npm test -- src/lib/identity/resolve-member.test.ts
  ```
  Expect all assertions green.

- [ ] **Step 5: Author the reserved `020` anchor migration.** Create `supabase/migrations/020_identity_reader_cutover.sql` with the FULL contents:
  ```sql
  -- ============================================================
  -- Migration 020: Identity reader-cutover anchor (Phase 1, spec §3.5, §6)
  --
  -- RESERVED slice — ships as its own PR AFTER the cutover gate is green
  -- (identity_link_audit clean: dup_member_email = 0). No schema change;
  -- records the cutover sentinel so the FK-first reader change is dated
  -- and reversible. The paired client change lives in useMyMember.ts and
  -- /api/me/roster-visibility (Task 8).
  -- ============================================================

  -- dashboard_settings exists from migration 007/016 (guarded create kept
  -- for self-sufficiency on partial environments).
  CREATE TABLE IF NOT EXISTS dashboard_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Hard guard: refuse to record the cutover sentinel while duplicate
  -- member emails remain (would make FK-first ambiguous, risk #2).
  DO $$
  DECLARE v_dups INT;
  BEGIN
    SELECT count(*) INTO v_dups FROM (
      SELECT email_normalized FROM members
      WHERE email_normalized IS NOT NULL
      GROUP BY email_normalized HAVING count(*) > 1
    ) d;
    IF v_dups > 0 THEN
      RAISE EXCEPTION 'identity reader cutover blocked: % duplicate member emails remain', v_dups;
    END IF;
  END $$;

  INSERT INTO dashboard_settings (key, value)
  VALUES ('identity_reader_cutover_at', NOW()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  ```

- [ ] **Step 6: Apply the `020` migration ONLY if the gate is green.** Confirm Task 6 Step 1 returned `0`. Then apply `020_identity_reader_cutover.sql` to project `ksmtkisknnvrjdfigsll` via Supabase MCP `apply_migration` (name `020_identity_reader_cutover`). Expect success. (If duplicates remain, the migration's `RAISE EXCEPTION` aborts it — which is the intended hard gate.)

- [ ] **Step 7: Verify the sentinel landed.** Run via Supabase MCP `execute_sql`:
  ```sql
  SELECT value FROM dashboard_settings WHERE key = 'identity_reader_cutover_at';
  ```
  Expect one timestamp string.

- [ ] **Step 8: Commit.** Run:
  ```
  git add "src/lib/identity/resolve-member.ts" "src/lib/identity/resolve-member.test.ts" "supabase/migrations/020_identity_reader_cutover.sql"
  git commit -m "feat(identity): reader-cutover resolver + gated migration 020 anchor

- pickMemberLookup() FK-first, email-fallback (pure, tested)
- 020 records cutover sentinel, hard-fails if duplicate member emails remain

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## TASK 8 (RESERVED, gated) — Cut `useMyMember` + `/api/me/roster-visibility` to FK-first

**Why:** This is the paired client change for the `020` slice (spec §3.5). It uses the FK first and keeps the existing `ilike(email)` as a fallback — **the email branch is NOT removed** (that is the deferred third slice). Ship in the same PR as Task 7. Do not start until Task 6's gate is green.

**Files**
- Modify `src/hooks/useMyMember.ts` (current lines 44-49 build the email query)
- Modify `src/app/api/me/roster-visibility/route.ts` (current lines 42-48 do the email lookup)

**Steps**

- [ ] **Step 1: Make `useMyMember` FK-first with email fallback.** In `src/hooks/useMyMember.ts`, replace the current block (lines 44-54):
  ```ts
      const email = profile.email.toLowerCase();
      const { data: rows, error: mErr } = await supabase
        .from('members')
        .select('id,name,company,chapter,email,phone,category_id')
        .ilike('email', email)
        .limit(1);
      if (mErr) {
        setError(mErr.message);
        setMember(null);
        return;
      }
  ```
  with FK-first-then-email-fallback:
  ```ts
      const cols = 'id,name,company,chapter,email,phone,category_id';
      const userId = session.user?.id ?? '';
      let rows: unknown[] | null = null;
      let mErr: { message: string } | null = null;

      // FK-first: members.user_id = session user id (spec §3.5).
      if (userId) {
        const byFk = await supabase
          .from('members')
          .select(cols)
          .eq('user_id', userId)
          .limit(1);
        rows = byFk.data ?? null;
        mErr = byFk.error;
      }
      // Email fallback (kept until the deferred email-removal slice).
      if (!mErr && (!rows || rows.length === 0)) {
        const email = profile.email.toLowerCase();
        const byEmail = await supabase
          .from('members')
          .select(cols)
          .ilike('email', email)
          .limit(1);
        rows = byEmail.data ?? null;
        mErr = byEmail.error;
      }
      if (mErr) {
        setError(mErr.message);
        setMember(null);
        return;
      }
  ```

- [ ] **Step 2: Make the roster-visibility route FK-first with email fallback.** In `src/app/api/me/roster-visibility/route.ts`, replace the current member lookup (lines 42-51):
  ```ts
    // Find the caller's member record by email (case-insensitive)
    const { data: memRow } = await sb
      .from('members')
      .select('id,chapter')
      .ilike('email', userData.user.email)
      .limit(1)
      .maybeSingle();
    if (!memRow) {
      return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });
    }
  ```
  with:
  ```ts
    // FK-first: members.user_id = auth user id (spec §3.5).
    let memRow: { id: string; chapter: string | null } | null = null;
    {
      const byFk = await sb
        .from('members')
        .select('id,chapter')
        .eq('user_id', userData.user.id)
        .limit(1)
        .maybeSingle();
      memRow = (byFk.data as { id: string; chapter: string | null } | null) ?? null;
    }
    // Email fallback (kept until the deferred email-removal slice).
    if (!memRow) {
      const byEmail = await sb
        .from('members')
        .select('id,chapter')
        .ilike('email', userData.user.email)
        .limit(1)
        .maybeSingle();
      memRow = (byEmail.data as { id: string; chapter: string | null } | null) ?? null;
    }
    if (!memRow) {
      return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });
    }
  ```

- [ ] **Step 3: Build + lint to confirm no type breakage.** Run:
  ```
  npm run lint && npm run build
  ```
  Expect lint clean and a successful production build (no TypeScript errors). If the build surfaces a latent type error in these two files, fix it within this task.

- [ ] **Step 4: Smoke-test the FK-first read returns the same member as the email path.** With a real linked test user (a member whose `members.user_id` was backfilled in Task 3), run via Supabase MCP `execute_sql` to confirm both paths agree:
  ```sql
  WITH u AS (
    SELECT m.user_id AS uid, m.email_normalized AS email
    FROM members m WHERE m.user_id IS NOT NULL LIMIT 1
  )
  SELECT
    (SELECT id FROM members WHERE user_id = (SELECT uid FROM u)) AS by_fk,
    (SELECT id FROM members WHERE email_normalized = (SELECT email FROM u) LIMIT 1) AS by_email;
  ```
  Expect `by_fk = by_email` (the FK-first path resolves the identical member the email path would). This is the §8 check-9 "still resolves" assertion.

- [ ] **Step 5: Smoke-test the live route returns 200 for a linked user, 401 without a token.** Run (replace `<TOKEN>` with a real linked member's `access_token`, against the running dev/prod app):
  ```
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$APP_URL/api/me/roster-visibility" \
    -H "content-type: application/json" \
    -H "authorization: Bearer <TOKEN>" \
    -d '{"chapter":"North","visible":true}'
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$APP_URL/api/me/roster-visibility" \
    -H "content-type: application/json" \
    -d '{"chapter":"North","visible":true}'
  ```
  Expect `200` (or `403 chapter_mismatch` if that member is not North — a valid non-500 outcome proving the lookup found the member) for the first, and `401` for the second (no token). A `500` is a failure.

- [ ] **Step 6: Commit.** Run:
  ```
  git add "src/hooks/useMyMember.ts" "src/app/api/me/roster-visibility/route.ts"
  git commit -m "feat(identity): cut useMyMember + roster-visibility to FK-first with email fallback

Spec §3.5 reader cutover (020 slice). Email branch retained; removal deferred.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Done when

This workstream is complete when the following Go/No-Go checks (spec §8), scoped to unified identity, all pass against prod-equivalent data:

- **Check 9 — Identity non-destructive (primary gate):**
  - Pre/post row counts identical across `members`/`profiles` (Task 2 snapshot == Task 3 Step 5 == Task 5 Step 3). *Verified.*
  - `identity_link_audit` shows **0** `dup_member_email` **before** any unique `email_normalized` index — and no unique index on `email_normalized` exists in `019` (Task 3 Steps 3, 5; Task 6 Step 1). *Verified.*
  - Every member that resolved via the old `ilike` path still resolves under FK-first (Task 6 Step 2; Task 8 Step 4 `by_fk = by_email`). *Verified.*
  - Deactivating a linked profile leaves the member row + history intact — both new FKs are `ON DELETE SET NULL`; `member_history.member_id` is `ON DELETE CASCADE` from `members` only (Task 3 Steps 4, 7). *Verified.*

- **Check 8 — Counts / 125 goal unchanged:** `fullMemberCount`, `afterHoursCount`, and per-chapter counts identical to the Phase-0 snapshot; After Hours / null-chapter still excluded; `member_status` defaults `'active'` so no row is hidden (Task 5 Step 3). *Verified.*

- **Check 10 — Helpers untouched:** `is_admin` / `is_chapter_director` / `get_user_chapter` signatures identical to `005`; `handle_new_user` body unchanged; no new policy inlines a `profiles` self-select (Task 2 Step 1; Task 5 Steps 4, 5). The two forward-fill triggers are **separate** `SECURITY DEFINER` functions, not edits to `handle_new_user` (Task 5 Step 6). *Verified.*

- **Reader-cutover gate (spec §3.5):** Migration `020` and the `useMyMember` / `roster-visibility` cutover ship only after `dup_member_email = 0`; `020` hard-fails (`RAISE EXCEPTION`) if duplicates remain (Task 6; Task 7 Steps 6-7). The email-match branch is **retained** as fallback — its removal is the deferred third slice, out of scope here (spec §3.5, §9).

- **Sequencing prerequisites (spec §7):** This workstream runs after Phase 0's `017`/`018`/`008`-fix and after P0-g (silent static-PII fallback removed), and before the lead-funnel `022` — because `022` consumes `email_normalized`. The reader-cutover `020`/Task 8 is gated behind a green `identity_link_audit`.
```
