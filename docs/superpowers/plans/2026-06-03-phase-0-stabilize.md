# Phase 0 — Stabilize & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first reversible, spine-untouching PR that closes the self-signup hole, authenticates the Wild Apricot routes, hides the recruitment funnel from members, fixes two data-loss bugs, removes the silent static-PII fallback, promotes the scanner SQL and reconciles the duplicate `events` table as migrations 017/018, regenerates the `Database` types, and lands the UX/a11y/password polish.

**Architecture:** All ten Phase 0 items (spec §2, P0-a … P0-j) are additive and do not touch the load-bearing spine: the three `SECURITY DEFINER` helpers `is_admin()`/`is_chapter_director()`/`get_user_chapter()` (`005_fix_rls_recursion.sql`), the `handle_new_user` trigger (`001_schema.sql:97-115`), or the `AuthGuard` branch order are reused verbatim. New profile/member FKs stay `ON DELETE SET NULL`. Pure logic (demo-mode gating, password-length validation, kanban-stage selection, requireAdmin token parsing) is extracted into testable `src/lib/*` functions with vitest TDD; migrations, RLS, API auth, and UI changes get concrete verifications (SQL row/count checks, `curl` HTTP-code checks, manual smoke steps).

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Supabase (Postgres + RLS), Tailwind, vitest. Supabase project ref ksmtkisknnvrjdfigsll.

---

## File Structure

**Created**
- `src/lib/api/auth.ts` — shared `requireAdmin(req)` server helper (Bearer-JWT → `role='admin'`); reuses the `roster-visibility`/`admin-auth` verification pattern. (P0-b)
- `src/lib/api/requireAdmin.test.ts` — vitest for the pure bearer-token parser `parseBearerToken`. (P0-b)
- `src/lib/demo-mode.ts` — `isDemoMode()` + pure `chooseInitialData`/`resolveFetchResult` helpers for the static-fallback decision. (P0-g)
- `src/lib/demo-mode.test.ts` — vitest for the demo-mode decision logic. (P0-g)
- `src/lib/pipeline/stages.ts` — pure `visibleKanbanStages` helper (returns all 8 stages, no slice). (P0-d)
- `src/lib/pipeline/stages.test.ts` — vitest proving stages 7 & 8 (`Application Received`, `Approved`) are never dropped. (P0-d)
- `src/lib/auth/password.ts` — pure `PASSWORD_MIN_LENGTH` + `validatePasswordLength`. (P0-i)
- `src/lib/auth/password.test.ts` — vitest for the min-8 rule. (P0-i)
- `supabase/migrations/017_scanner_enhancements.sql` — verbatim promote of `scripts/sql/03_scanner_enhancements.sql`. (P0-f)
- `supabase/migrations/018_events_reconcile.sql` — `events` superset (`010` base + nullable `003` columns). (P0-h)

**Modified**
- `src/components/auth/LoginForm.tsx` — remove `'signup'` mode; "Sign up" → anchor to `/join`; password min 6→8 via the new helper. (P0-a, P0-i)
- `src/contexts/AuthContext.tsx` — `signUp` becomes a disabled guard. (P0-a)
- `src/app/page.tsx` — move `targets`/`pipeline` into the `isAdmin || isDirector` block; ARIA `tablist`/`tab`/`tabpanel`. (P0-c, P0-i)
- `src/components/tabs/ScannerTab.tsx` — gate the "Invite to event" panel behind `isAdmin || isDirector`. (P0-c)
- `src/components/tabs/PipelineTab.tsx` — render all 8 stages via the helper; grid `lg:grid-cols-4 xl:grid-cols-8`. (P0-d)
- `src/lib/supabase.ts` — `createClient<Database>`; export `isDemoMode` re-export point. (P0-e, P0-g)
- `src/lib/database.types.ts` — regenerated from the live schema. (P0-e)
- `src/hooks/useMembers.ts` / `src/hooks/useGuests.ts` — typed rows; demo-mode-gated initial state + explicit empty state. (P0-e, P0-g)
- `src/hooks/useWildApricot.ts` — thread `Authorization: Bearer <access_token>` on the three POSTs. (P0-b)
- `src/app/api/wa/{sync-members,sync-events,push-member}/route.ts` — call `requireAdmin`; return 401/403. (P0-b)
- `src/components/ui/Modal.tsx` — focus trap + autoFocus + restore focus. (P0-i)
- `src/app/layout.tsx` — `next/font` (Inter). (P0-i)
- `src/components/auth/ChangePasswordModal.tsx` — heading "Set a New Password"; min-8 copy + validation. (P0-i)
- `supabase/migrations/008_must_change_password.sql` — remove the stray `did` token. (P0-j)

---

## Task 1 — P0-j: Fix migration 008 stray token (clean-rebuild reproducibility)

Smallest, lowest-risk, sequencing-first item (spec §7 row 10). No code dependencies.

**Files**
- Modify: `supabase/migrations/008_must_change_password.sql` (L5 stray `did `)

**Steps**

- [ ] **Step 1: Inspect the broken line.** Run `grep -n "did" "supabase/migrations/008_must_change_password.sql"` and confirm the output is exactly `5:did ` (the stray token after the `ALTER TABLE`).
- [ ] **Step 2: Remove the stray token.** Edit `supabase/migrations/008_must_change_password.sql` to delete the trailing `did ` line so the file ends after the `ALTER TABLE`:

```sql
-- Add must_change_password flag to profiles table
-- Used to force bulk-created member accounts to set a new password on first login

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Verify the file parses (no stray token).** Run `tail -c 200 "supabase/migrations/008_must_change_password.sql"` and confirm the file ends with `... DEFAULT false;` followed by a single newline and NO `did`. Expected: the last non-empty line is the `ALTER TABLE ...;` statement.
- [ ] **Step 4: Commit.** `git add "supabase/migrations/008_must_change_password.sql"` then `git commit -m "fix(migrations): remove stray 'did' token from 008 so clean db reset succeeds"`.

---

## Task 2 — P0-f: Promote scanner SQL to migration 017

The scanner 500s on any env where `scripts/sql/03` was never pasted (spec §2 P0-f, §6 row 017). Verbatim copy; already idempotent; FKs `ON DELETE SET NULL`.

**Files**
- Create: `supabase/migrations/017_scanner_enhancements.sql`
- Read (source): `scripts/sql/03_scanner_enhancements.sql`

**Steps**

- [ ] **Step 1: Create `supabase/migrations/017_scanner_enhancements.sql`** with the columns `/api/scan` writes (`scanned_by_profile_id`, `target_guest_id`, `target_member_id`, `email_normalized`), copied verbatim from `scripts/sql/03` minus the dashboard-paste banner and the final ad-hoc `SELECT`:

```sql
-- ============================================================
-- Migration 017: Scanner enhancements (promoted from scripts/sql/03)
-- Extend business_card_scans to track who scanned + what they scanned.
-- Idempotent (IF NOT EXISTS). New FKs are ON DELETE SET NULL.
-- /api/scan writes scanned_by_profile_id, target_guest_id,
-- target_member_id, email_normalized — without this migration the
-- scanner 500s on any environment where scripts/sql/03 was never run.
-- ============================================================

ALTER TABLE public.business_card_scans
  ADD COLUMN IF NOT EXISTS scanned_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_guest_id      uuid REFERENCES public.guests(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_member_id     uuid REFERENCES public.members(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_normalized     text;

-- Backfill normalized email for any pre-existing rows
UPDATE public.business_card_scans
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL AND email IS NOT NULL AND email <> '';

-- Indexes for the lookups the API does on every scan
CREATE INDEX IF NOT EXISTS business_card_scans_email_normalized_idx
  ON public.business_card_scans(email_normalized);
CREATE INDEX IF NOT EXISTS business_card_scans_scanned_by_idx
  ON public.business_card_scans(scanned_by_profile_id);
CREATE INDEX IF NOT EXISTS business_card_scans_target_member_idx
  ON public.business_card_scans(target_member_id);
```

- [ ] **Step 2: Apply the migration to the live project** via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `017_scanner_enhancements`) with the SQL from Step 1. (On a paste-already-applied prod this is a no-op thanks to `IF NOT EXISTS`.)
- [ ] **Step 3: Verify the four columns exist (concrete check).** Run via the Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'business_card_scans'
  AND column_name IN ('scanned_by_profile_id','target_guest_id','target_member_id','email_normalized')
ORDER BY column_name;
```

Expected output: exactly 4 rows — `email_normalized | text`, `scanned_by_profile_id | uuid`, `target_guest_id | uuid`, `target_member_id | uuid`.

- [ ] **Step 4: Verify the new FKs are `ON DELETE SET NULL`** (spec §7 row 8). Run via `execute_sql`:

```sql
SELECT con.conname, con.confdeltype
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'business_card_scans' AND con.contype = 'f'
  AND con.conname LIKE '%target%' OR con.conname LIKE '%scanned_by%';
```

Expected: every matching FK row has `confdeltype = 'n'` (SET NULL). Any other value is a regression — stop and fix.

- [ ] **Step 5: Commit.** `git add "supabase/migrations/017_scanner_enhancements.sql"` then `git commit -m "feat(migrations): promote scanner enhancements to 017 (scan-write columns, SET NULL FKs)"`.

---

## Task 3 — P0-h: Reconcile the duplicate `events` table as migration 018

`003_wildapricot.sql:15` and `010_intake_events.sql:4` both `CREATE TABLE IF NOT EXISTS events` with disjoint columns; whichever ran first wins (spec §2 P0-h, §7 row 3). Pin the live schema as a documented superset: keep `010`'s columns (`title/starts_at/ends_at/ics_uid/public_visible`) and `ADD COLUMN IF NOT EXISTS` the nullable `003` columns (`wa_event_id`, `registration_url`, plus the others the WA sync route writes). No events-dependent work ships before this.

**Files**
- Create: `supabase/migrations/018_events_reconcile.sql`
- Read (context): `supabase/migrations/003_wildapricot.sql`, `supabase/migrations/010_intake_events.sql`, `src/app/api/wa/sync-events/route.ts`

**Steps**

- [ ] **Step 1: Inspect the LIVE `events` schema first** (spec §2 P0-h "inspect the live (prod) schema"). Run via the Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;
```

Record which `CREATE TABLE` won. The reconcile must `ADD` whatever is missing so `events` becomes the superset of both definitions. Note that `sync-events` writes `name, description, event_date, end_date, location, event_type, wa_event_id, registration_url, max_registrants, current_registrants` and the guest flow reads `title, starts_at, ends_at, kind, chapter, location_name, location_address, ics_uid, public_visible`.

- [ ] **Step 2: Create `supabase/migrations/018_events_reconcile.sql`** as the canonical superset. All adds are `IF NOT EXISTS` and nullable so neither prior winner loses data:

```sql
-- ============================================================
-- Migration 018: Reconcile the duplicate `events` table
--
-- 003_wildapricot.sql and 010_intake_events.sql each ran
-- `CREATE TABLE IF NOT EXISTS events` with disjoint columns; the
-- first to run wins and the other is a silent no-op. This pins the
-- canonical `events` definition as the documented SUPERSET of both,
-- so fresh rebuilds match prod and every events writer/reader works.
--
-- Keeps 010's intake columns (title/starts_at/ends_at/ics_uid/
-- public_visible) and ADDS nullable 003/WA-sync columns.
-- Additive only — no column dropped, no row removed.
-- ============================================================

-- 010 (intake) columns — present if 010 won, added if 003 won.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS chapter          TEXT,
  ADD COLUMN IF NOT EXISTS kind             TEXT,
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS starts_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_name    TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS ics_uid          TEXT,
  ADD COLUMN IF NOT EXISTS public_visible   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- 003 / Wild Apricot sync columns — nullable so intake-only rows are fine.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS name                 TEXT,
  ADD COLUMN IF NOT EXISTS event_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_date             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location             TEXT,
  ADD COLUMN IF NOT EXISTS event_type           TEXT,
  ADD COLUMN IF NOT EXISTS wa_event_id          TEXT,
  ADD COLUMN IF NOT EXISTS registration_url     TEXT,
  ADD COLUMN IF NOT EXISTS max_registrants      INTEGER,
  ADD COLUMN IF NOT EXISTS current_registrants  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- Keep the unique constraint the WA upsert relies on (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS events_wa_event_id_key
  ON public.events(wa_event_id) WHERE wa_event_id IS NOT NULL;

-- Indexes the readers use (idempotent; no-op if already present).
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS events_chapter_idx   ON public.events(chapter);
```

- [ ] **Step 3: Apply the migration** via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `018_events_reconcile`).
- [ ] **Step 4: Verify the superset (concrete check).** Run via `execute_sql`:

```sql
SELECT COUNT(*) AS superset_cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='events'
  AND column_name IN
   ('title','starts_at','ends_at','ics_uid','public_visible',
    'wa_event_id','registration_url','name','event_date');
```

Expected: `superset_cols = 9`. If fewer, the superset is incomplete — stop and add the missing columns.

- [ ] **Step 5: Verify the public anon read still works** (spec §8 check 7 — `events_public_read` returns rows). Run via `execute_sql` as the implicit definer (table-shape sanity), then confirm the policy is intact:

```sql
SELECT polname FROM pg_policy WHERE polrelid = 'public.events'::regclass
  AND polname IN ('events_public_read','events_auth_read');
```

Expected: both `events_public_read` and `events_auth_read` listed (untouched by 018).

- [ ] **Step 6: Verify no row count change** (spec §7 row 3 / §8 — additive only). Run `SELECT COUNT(*) FROM public.events;` before (Step 1) and after (now); the two counts must be identical.
- [ ] **Step 7: Commit.** `git add "supabase/migrations/018_events_reconcile.sql"` then `git commit -m "feat(migrations): reconcile duplicate events table as 018 documented superset"`.

---

## Task 4 — P0-g: Remove the silent static-PII fallback (the anti-fabrication prerequisite)

The single most important Phase 0 change (spec §1.2, §7 row 1). `useMembers`/`useGuests` silently substitute hardcoded PII on zero rows. Add `isDemoMode()` (default off) and route the static seed ONLY through `!isConfigured || isDemoMode()`; a real zero-row result renders an explicit empty state, never the static list. Pure decision logic is extracted and unit-tested so the verification is airtight.

**Files**
- Create: `src/lib/demo-mode.ts`, `src/lib/demo-mode.test.ts`
- Modify: `src/lib/supabase.ts` (re-export point), `src/hooks/useMembers.ts` (L33,54-57), `src/hooks/useGuests.ts` (L43,64-67)
- Read (context): `src/data/members.ts`, `src/data/guests.ts`

**Steps**

- [ ] **Step 1: Write the failing test `src/lib/demo-mode.test.ts`** (TDD). Full code:

```ts
import { describe, test, expect } from 'vitest';
import { chooseInitialData, resolveFetchResult } from './demo-mode';

describe('chooseInitialData()', () => {
  test('uses the static seed only when not configured or in demo mode', () => {
    const seed = [{ id: 'seed' }];
    expect(chooseInitialData(seed, { isConfigured: false, isDemo: false })).toBe(seed);
    expect(chooseInitialData(seed, { isConfigured: true, isDemo: true })).toBe(seed);
  });

  test('starts EMPTY for a real configured, non-demo reader (no fabrication)', () => {
    const seed = [{ id: 'seed' }];
    expect(chooseInitialData(seed, { isConfigured: true, isDemo: false })).toEqual([]);
  });
});

describe('resolveFetchResult()', () => {
  const seed = [{ id: 'seed' }];
  const rows = [{ id: 'real-1' }, { id: 'real-2' }];

  test('real rows always replace whatever was there', () => {
    expect(resolveFetchResult(rows, seed, { isConfigured: true, isDemo: false })).toEqual(rows);
  });

  test('zero real rows in a live (non-demo) env yields EMPTY, never the seed', () => {
    expect(resolveFetchResult([], seed, { isConfigured: true, isDemo: false })).toEqual([]);
  });

  test('zero rows in demo mode falls back to the seed (explicit opt-in only)', () => {
    expect(resolveFetchResult([], seed, { isConfigured: true, isDemo: true })).toBe(seed);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** Run `npm test -- src/lib/demo-mode.test.ts`. Expected failure: `Error: Failed to resolve import "./demo-mode"` (the module does not exist yet).
- [ ] **Step 3: Write the minimal implementation `src/lib/demo-mode.ts`.** Full code:

```ts
/**
 * Demo mode is OFF by default. It is the ONLY switch that allows the
 * hardcoded static seed (src/data/*) to be shown. A real configured
 * reader that gets zero rows must see an empty state, never fabricated PII.
 * (Spec §1.2 anti-fabrication invariant; §2 P0-g.)
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export interface DataMode {
  isConfigured: boolean;
  isDemo: boolean;
}

/** Initial state before any fetch. Seed only when not configured or in demo. */
export function chooseInitialData<T>(seed: T[], mode: DataMode): T[] {
  if (!mode.isConfigured || mode.isDemo) return seed;
  return [];
}

/** After a fetch: real rows win; on zero rows, seed only in demo mode. */
export function resolveFetchResult<T>(rows: T[], seed: T[], mode: DataMode): T[] {
  if (rows.length > 0) return rows;
  if (mode.isDemo) return seed;
  return [];
}
```

- [ ] **Step 4: Run the test, expect PASS.** Run `npm test -- src/lib/demo-mode.test.ts`. Expected: `Test Files  1 passed`, all 5 tests green.
- [ ] **Step 5: Re-export `isDemoMode` from `src/lib/supabase.ts`** so hooks import demo state from one place. Append to `src/lib/supabase.ts`:

```ts
export { isDemoMode } from './demo-mode';
```

- [ ] **Step 6: Rewire `useMembers` to use the helpers.** In `src/hooks/useMembers.ts`, change the import line (L7-8 area) to add the helpers and keep the static seed import:

```ts
import { members as staticMembers } from '@/data/members';
import { chooseInitialData, resolveFetchResult, isDemoMode } from '@/lib/demo-mode';
import { summarizeMembers } from '@/lib/members/summary';
```

Replace the state init (L33) so it no longer seeds a live reader:

```ts
  const isConfigured = isSupabaseConfigured();
  const isDemo = isDemoMode();
  const [members, setMembers] = useState<Member[]>(
    chooseInitialData(staticMembers, { isConfigured, isDemo })
  );
```

Replace the fetch result handling (L51-57) so zero rows clears instead of keeping the seed:

```ts
      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else {
        const rows = (data ?? []).map(transformDbToMember);
        setMembers(resolveFetchResult(rows, staticMembers, { isConfigured, isDemo }));
      }
```

(Remove the now-stale `const isConfigured = isSupabaseConfigured();` duplicate at old L37 if it remains — there must be exactly one declaration.)

- [ ] **Step 7: Rewire `useGuests` identically.** In `src/hooks/useGuests.ts` add the import:

```ts
import { initialGuests, getNextStatus, getNextStepText } from '@/data/guests';
import { chooseInitialData, resolveFetchResult, isDemoMode } from '@/lib/demo-mode';
```

Replace state init (L43-47):

```ts
  const isConfigured = isSupabaseConfigured();
  const isDemo = isDemoMode();
  const [guests, setGuests] = useState<Guest[]>(
    chooseInitialData(initialGuests, { isConfigured, isDemo })
  );
```

Replace the fetch result handling (L61-67):

```ts
      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching guests:', fetchError);
      } else {
        const rows = (data ?? []).map(transformDbToGuest);
        setGuests(resolveFetchResult(rows, initialGuests, { isConfigured, isDemo }));
      }
```

- [ ] **Step 8: Add an explicit empty-state to the Members list UI.** Read `src/components/tabs/MembersTab.tsx`; if `members.length === 0 && isConfigured && !loading`, render a visible "No members found" panel (not a blank grid). Add, where the member grid renders:

```tsx
{!loading && members.length === 0 && (
  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
    <p className="font-medium text-slate-700">No members found</p>
    <p className="text-sm mt-1">
      Your account is connected but the directory returned no rows. If you expected members,
      contact an admin — the dashboard will not show placeholder data.
    </p>
  </div>
)}
```

- [ ] **Step 9: Add a fingerprint row to the live DB** (spec §8 check 5 — exists only in the DB, absent from `src/data/*`). Run via `execute_sql`:

```sql
INSERT INTO public.members (name, company, chapter, industry, email)
VALUES ('Fingerprint Tester', 'DB-Only Co', 'North', 'QA', 'fingerprint@bloc-test.invalid')
ON CONFLICT (email) DO NOTHING
RETURNING id, name;
```

Expected: one returned row `Fingerprint Tester`. Confirm this name appears in NEITHER `src/data/members.ts` NOR `src/data/guests.ts` (`grep -ri "Fingerprint Tester" src/data/` returns nothing).

- [ ] **Step 10: Verify airtight fallback removal (the key Go/No-Go check).** Run `npm test -- src/lib/demo-mode.test.ts` (green), then `grep -n "keep static fallback\|keep the seed" src/hooks/useMembers.ts src/hooks/useGuests.ts` — expected: NO matches (the comment and behavior are gone). Start the app with `NEXT_PUBLIC_DEMO_MODE` unset, log in as `member`, open Members: the fingerprint row is visible and the static `Ali Martin` seed is NOT present unless it is a real DB row.
- [ ] **Step 11: Commit.** `git add src/lib/demo-mode.ts src/lib/demo-mode.test.ts src/lib/supabase.ts src/hooks/useMembers.ts src/hooks/useGuests.ts src/components/tabs/MembersTab.tsx` then `git commit -m "fix(data): remove silent static-PII fallback behind NEXT_PUBLIC_DEMO_MODE (anti-fabrication)"`.

---

## Task 5 — P0-a: Close the open self-signup hole

Remove the in-app `'signup'` mode; replace the "Sign up" toggle with an anchor to the public `/join` page. Make `AuthContext.signUp` a guard. `handle_new_user` (admin-provisioned accounts) stays intact (spec §2 P0-a).

**Files**
- Modify: `src/contexts/AuthContext.tsx` (`signUp` L165-198)
- Modify: `src/components/auth/LoginForm.tsx` (Mode type L13; signup branches; toggle L259-271)

**Steps**

- [ ] **Step 1: Turn `AuthContext.signUp` into a disabled guard.** In `src/contexts/AuthContext.tsx` replace the whole `signUp` body (L165-198) — keep the method on the interface (narrower blast radius), but never call Supabase:

```ts
  const signUp = async (
    _email: string,
    _password: string,
    _fullName: string
  ): Promise<{ error: string | null }> => {
    // Self-signup is disabled. Accounts are admin-provisioned; new members
    // apply at /join. handle_new_user still runs for provisioned accounts.
    return { error: 'Self-signup is disabled. Apply at /join.' };
  };
```

- [ ] **Step 2: Drop `'signup'` from the `Mode` type and signup branches in `LoginForm.tsx`.** Change L13:

```ts
type Mode = 'signin' | 'reset' | 'magic';
```

Remove the `const isSignUp = mode === 'signup';` line and every `isSignUp`/`fullName` branch in `handleSubmit` (the full-name guard, the `signUp` call block, and the `isSignUp` ternaries in the heading, button label, and password `autoComplete`). The submit handler's password path becomes:

```ts
    if (!email || !password) {
      setLocalError('Please fill in all required fields');
      return;
    }

    if (!validatePasswordLength(password)) {
      setLocalError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    if (!error && onSuccess) {
      onSuccess();
    }
    setIsSubmitting(false);
```

(The `validatePasswordLength`/`PASSWORD_MIN_LENGTH` import is added in Task 9; until then keep the literal `password.length < 6` guard and let Task 9 update it. To avoid a broken intermediate commit, do Task 9 Step 1-4 before this if executing strictly in order — or land both in the same PR.)

- [ ] **Step 3: Replace the "Sign up" toggle (L259-271) with a `/join` anchor.** Replace that bottom `<div>` block with:

```tsx
            <div>
              {isPasswordless ? (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-sm text-bloc-blue hover:text-bloc-navy"
                >
                  Back to sign in
                </button>
              ) : (
                <a
                  href="/join"
                  className="text-sm text-bloc-blue hover:text-bloc-navy"
                >
                  Not a member yet? Apply to join
                </a>
              )}
            </div>
```

Also remove the now-unused `User` icon import and the `fullName` state + its `<input>` block (L167-184 area).

- [ ] **Step 4: Verify no signup path remains (concrete check).** Run `grep -rn "signup\|isSignUp\|Create Account\|Create your account" src/components/auth/LoginForm.tsx` — expected: NO matches except possibly a comment. Run `grep -n "Self-signup is disabled" src/contexts/AuthContext.tsx` — expected: exactly one match.
- [ ] **Step 5: Manual smoke (spec §8 check 1 — provisioning unaffected).** `npm run dev`, open `/`, confirm there is no "Sign up / Create Account" form, the "Apply to join" link points to `/join`, and signing in with an existing account still works. Confirm `handle_new_user` is untouched: `grep -c "handle_new_user" supabase/migrations/001_schema.sql` returns a non-zero count and no migration in this PR alters it.
- [ ] **Step 6: Commit.** `git add src/contexts/AuthContext.tsx src/components/auth/LoginForm.tsx` then `git commit -m "feat(auth): close self-signup; signUp is a guard, login links to /join"`.

---

## Task 6 — P0-b: Authenticate the three `/api/wa/*` routes via a shared `requireAdmin`

The three WA POSTs currently have zero auth (spec §2 P0-b, §7/§8 check 10: 401 no-token, 403 member, 200 admin). Add one shared `requireAdmin(req)` (Bearer-JWT → `role='admin'`, org-wide sync) modeled on `src/lib/admin-auth.ts`/`roster-visibility`, and thread the session token from `useWildApricot`.

**Files**
- Create: `src/lib/api/auth.ts`, `src/lib/api/requireAdmin.test.ts`
- Modify: `src/app/api/wa/sync-members/route.ts`, `src/app/api/wa/sync-events/route.ts`, `src/app/api/wa/push-member/route.ts`
- Modify: `src/hooks/useWildApricot.ts` (L77, L101, L125)
- Read (pattern): `src/lib/admin-auth.ts`, `src/app/api/me/roster-visibility/route.ts`

**Steps**

- [ ] **Step 1: Write the failing test `src/lib/api/requireAdmin.test.ts`** for the pure token parser (the DB call itself is integration-verified by curl in Step 7). Full code:

```ts
import { describe, test, expect } from 'vitest';
import { parseBearerToken } from './auth';

describe('parseBearerToken()', () => {
  test('extracts the token from a well-formed header', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  test('is case-insensitive on the scheme and trims', () => {
    expect(parseBearerToken('bearer   xyz  ')).toBe('xyz');
  });
  test('returns empty string when missing or malformed', () => {
    expect(parseBearerToken('')).toBe('');
    expect(parseBearerToken(null)).toBe('');
    expect(parseBearerToken('Basic abc')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** `npm test -- src/lib/api/requireAdmin.test.ts`. Expected: `Failed to resolve import "./auth"`.
- [ ] **Step 3: Write `src/lib/api/auth.ts`.** Full code (mirrors `admin-auth.ts` exactly, but requires `role='admin'`):

```ts
import { createClient } from '@supabase/supabase-js';

export type AdminOnlyProfile = { id: string; role: 'admin'; chapter: string | null };

/** Pure: pull the bearer token out of an Authorization header. */
export function parseBearerToken(authHeader: string | null): string {
  const auth = authHeader ?? '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export type RequireAdminResult =
  | { ok: true; profile: AdminOnlyProfile }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * Verify Authorization: Bearer <jwt> and require role='admin'.
 * WA sync is org-wide, so directors are NOT sufficient.
 * 401 = no/invalid token; 403 = authenticated but not admin; 500 = misconfig.
 */
export async function requireAdmin(req: Request): Promise<RequireAdminResult> {
  const token = parseBearerToken(req.headers.get('authorization'));
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, status: 500, error: 'server_misconfigured' };

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: 'unauthorized' };

  const { data: profile } = await sb
    .from('profiles')
    .select('id,role,chapter')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return { ok: false, status: 401, error: 'unauthorized' };
  if (profile.role !== 'admin') return { ok: false, status: 403, error: 'forbidden' };

  return { ok: true, profile: profile as AdminOnlyProfile };
}
```

- [ ] **Step 4: Run the test, expect PASS.** `npm test -- src/lib/api/requireAdmin.test.ts`. Expected: 3 tests green.
- [ ] **Step 5: Guard each WA route.** In `src/app/api/wa/sync-members/route.ts`, change the handler signature from `export async function POST()` to accept the request and gate at the top:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/api/auth';
import {
  getActiveMembers,
  isWildApricotConfigured,
  WAContact,
} from '@/lib/wildapricot';
```

```ts
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (!isWildApricotConfigured()) {
    return NextResponse.json(
      { error: 'Wild Apricot is not configured' },
      { status: 400 }
    );
  }
  // ...rest unchanged
```

Apply the identical gate (the `requireAdmin` import + the 4-line gate block at the top of `POST`) to `src/app/api/wa/sync-events/route.ts` (change `POST()` → `POST(request: Request)`) and `src/app/api/wa/push-member/route.ts` (already `POST(request: Request)` — just add the import and the gate block as the first statements before reading the body).

- [ ] **Step 6: Thread the session token from `useWildApricot`.** In `src/hooks/useWildApricot.ts` add a helper at the top of the hook and use it on all three fetches:

```ts
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);
```

Update `syncMembers` (L77):

```ts
      const response = await fetch('/api/wa/sync-members', {
        method: 'POST',
        headers: await authHeaders(),
      });
```

Update `syncEvents` (L101):

```ts
      const response = await fetch('/api/wa/sync-events', {
        method: 'POST',
        headers: await authHeaders(),
      });
```

Update `pushToWA` (L125):

```ts
      const response = await fetch('/api/wa/push-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ guestId }),
      });
```

- [ ] **Step 7: Concrete HTTP verification (spec §8 check 10).** With `npm run dev` running, run:

```bash
# No token -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/wa/sync-members
# A member's access_token -> 403   (paste a real member JWT)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/wa/sync-members -H "Authorization: Bearer $MEMBER_JWT"
# An admin's access_token -> 200/400 (200 if WA configured; 400 = WA-not-configured, which still proves auth passed)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/wa/sync-members -H "Authorization: Bearer $ADMIN_JWT"
```

Expected: `401`, then `403`, then `200` (or `400` "Wild Apricot is not configured" — never `401/403`). Repeat for `sync-events` and `push-member` (push-member admin call expects `400` guestId-required, which proves the gate passed).

- [ ] **Step 8: Commit.** `git add src/lib/api/auth.ts src/lib/api/requireAdmin.test.ts src/app/api/wa/sync-members/route.ts src/app/api/wa/sync-events/route.ts src/app/api/wa/push-member/route.ts src/hooks/useWildApricot.ts` then `git commit -m "feat(api): require admin on /api/wa/* via shared requireAdmin; thread session token"`.

---

## Task 7 — P0-c: Hide the recruitment funnel from plain members

Move **Most Wanted** (`targets`) and **Guest Pipeline** (`pipeline`) out of `baseTabs` into the `isAdmin || isDirector` block, preserving `#targets`/`#pipeline` ids and the `useMemo`/`#hash` shape. Gate the Scanner "Invite to event" panel behind `isAdmin || isDirector` (spec §2 P0-c; defense-in-depth, the invite API already enforces `requireDirector`).

**Files**
- Modify: `src/app/page.tsx` (baseTabs L58-66; useMemo L106-129)
- Modify: `src/components/tabs/ScannerTab.tsx` (`canInvite` L377)

**Steps**

- [ ] **Step 1: Remove `targets` and `pipeline` from `baseTabs`** (`src/app/page.tsx` L58-66). New `baseTabs`:

```ts
const baseTabs: TabConfig[] = [
  { id: 'dashboard', label: 'Dashboard',         icon: <LayoutDashboard size={18} />, component: <DashboardTab />,        group: 'core' },
  { id: 'leadership', label: 'Leadership',       icon: <Users size={18} />,           component: <LeadershipTab />,       group: 'core' },
  { id: 'members', label: 'Members',             icon: <Search size={18} />,          component: <MembersTab />,          group: 'core' },
  { id: 'scanner', label: 'Card Scanner',        icon: <CreditCard size={18} />,      component: <ScannerTab />,          group: 'core' },
  { id: 'guide', label: 'Membership Guide',      icon: <BookOpen size={18} />,        component: <MembershipGuideTab />,  group: 'core' },
];
```

- [ ] **Step 2: Add `targets` and `pipeline` to the staff block** inside the `tabs` useMemo (`src/app/page.tsx` L110-118). Make them the FIRST two pushes so their `core`-group sort keeps them adjacent to membership tabs:

```ts
    if (isAdmin || isDirector) {
      all.push(
        { id: 'targets', label: 'Most Wanted',     icon: <Target size={18} />,      component: <TargetsTab />,     group: 'core' },
        { id: 'pipeline', label: 'Guest Pipeline', icon: <UserPlus size={18} />,    component: <PipelineTab />,    group: 'core' },
        { id: 'intake', label: 'Guest Inbox',      icon: <Inbox size={18} />,       component: <IntakeGuestsTab />, group: 'guestflow' },
        { id: 'events', label: 'Events',           icon: <CalendarDays size={18} />, component: <EventsTab />,      group: 'guestflow' },
        { id: 'qr', label: 'QR Codes',             icon: <QrCode size={18} />,      component: <QrTokensTab />,     group: 'guestflow' },
        { id: 'roster', label: 'Roster',           icon: <Users2 size={18} />,      component: <RosterTab />,       group: 'guestflow' },
        { id: 'seats', label: 'Category Seats',    icon: <Grid3x3 size={18} />,     component: <SeatMapTab />,      group: 'guestflow' },
      );
    }
```

- [ ] **Step 3: Gate the Scanner invite panel.** In `src/components/tabs/ScannerTab.tsx`, import `useAuth` and require staff. Add to the imports:

```ts
import { useAuth } from '@/contexts/AuthContext';
```

In `ScanMatchPanel`, read the role and fold it into `canInvite` (L377):

```ts
function ScanMatchPanel({ card }: { card: ScannedCard }) {
  const { events } = useEvents();
  const { isAdmin, isDirector } = useAuth();
  const toast = useToast();
  // ...
  const canInvite = (isAdmin || isDirector) && card.guestId !== null && !!card.email;
```

- [ ] **Step 4: Verify role-gating (spec §8 check 3).** `npm run dev`, sign in as `member`: the nav shows NO "Most Wanted" and NO "Guest Pipeline"; the Scanner shows no "Invite to event" panel. Sign in as `chapter_director` and `admin`: both tabs present and the invite panel appears. Confirm deep-links still resolve: visiting `/#targets` as a member lands on a valid tab (falls through to the first tab, not a crash); as a director it opens Most Wanted.
- [ ] **Step 5: Verify the `#hash`/useMemo shape is intact.** Run `grep -n "groupBoundaries\|order.indexOf\|history.replaceState" src/app/page.tsx` — confirm the group-ordering useMemo and hash persistence are unchanged from the original.
- [ ] **Step 6: Commit.** `git add src/app/page.tsx src/components/tabs/ScannerTab.tsx` then `git commit -m "feat(nav): hide Most Wanted + Guest Pipeline from members; gate scanner invite to staff"`.

---

## Task 8 — P0-d: Fix the kanban `slice(0,6)` stage-hiding bug

`displayStages = guestsByStage.slice(0, 6)` (PipelineTab L323) silently drops `Application Received` and `Approved` — guests in those stages vanish (spec §2 P0-d). Render all 8 stages; grid `lg:grid-cols-4 xl:grid-cols-8`. Extract the selection into a tested pure function.

**Files**
- Create: `src/lib/pipeline/stages.ts`, `src/lib/pipeline/stages.test.ts`
- Modify: `src/components/tabs/PipelineTab.tsx` (L323; grid L404)
- Read (context): `src/data/guests.ts` (`pipelineStages` — 8 entries)

**Steps**

- [ ] **Step 1: Write the failing test `src/lib/pipeline/stages.test.ts`** (TDD). Full code:

```ts
import { describe, test, expect } from 'vitest';
import { visibleKanbanStages } from './stages';

type Stage = { status: string };

describe('visibleKanbanStages()', () => {
  const all: Stage[] = [
    { status: 'New Lead' },
    { status: 'After Hours Invited' },
    { status: 'After Hours Done' },
    { status: 'Lunch Invited' },
    { status: 'Lunch Done' },
    { status: 'Application Sent' },
    { status: 'Application Received' },
    { status: 'Approved' },
  ];

  test('returns every stage (never drops Application Received / Approved)', () => {
    const out = visibleKanbanStages(all);
    expect(out).toHaveLength(8);
    expect(out.map((s) => s.status)).toContain('Application Received');
    expect(out.map((s) => s.status)).toContain('Approved');
  });

  test('preserves order and identity', () => {
    expect(visibleKanbanStages(all)).toEqual(all);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** `npm test -- src/lib/pipeline/stages.test.ts`. Expected: `Failed to resolve import "./stages"`.
- [ ] **Step 3: Write `src/lib/pipeline/stages.ts`.** Full code:

```ts
/**
 * All 8 pipeline stages render. The old `slice(0,6)` silently hid
 * "Application Received" and "Approved", making guests in those stages
 * disappear (P0-d). This helper exists so the no-drop guarantee is tested.
 */
export function visibleKanbanStages<T>(stages: T[]): T[] {
  return stages;
}
```

- [ ] **Step 4: Run the test, expect PASS.** `npm test -- src/lib/pipeline/stages.test.ts`. Expected: 2 tests green.
- [ ] **Step 5: Use the helper in `PipelineTab.tsx`.** Add the import:

```ts
import { visibleKanbanStages } from '@/lib/pipeline/stages';
```

Replace L323:

```ts
  // Render all 8 stages — no slicing (was slice(0,6), which hid App Received + Approved).
  const displayStages = visibleKanbanStages(guestsByStage);
```

- [ ] **Step 6: Widen the grid (L404)** so 8 columns fit:

```tsx
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
```

- [ ] **Step 7: Verify (concrete check).** Run `grep -n "slice(0, 6)\|slice(0,6)" src/components/tabs/PipelineTab.tsx` — expected: NO matches. `npm run dev`, open Guest Pipeline as a director, confirm 8 columns including "App Received" and "Approved" render. With a DB guest in status `Application Received`, confirm the card appears (previously hidden).
- [ ] **Step 8: Commit.** `git add src/lib/pipeline/stages.ts src/lib/pipeline/stages.test.ts src/components/tabs/PipelineTab.tsx` then `git commit -m "fix(pipeline): render all 8 kanban stages (drop slice(0,6) that hid 2 stages)"`.

---

## Task 9 — P0-i: UX polish — password min 6→8, force-password heading, Modal focus trap, ARIA tablist, next/font

Five low-risk polish items (spec §2 P0-i): bump password min 6→8 consistently (extract + test the rule), fix the "Welcome to BLOC!" force-password heading to "Set a New Password", add a focus trap + autoFocus to `Modal`, add `role=tablist/tab/tabpanel` + `aria-selected` to the nav, and load `next/font`.

**Files**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`
- Modify: `src/components/auth/ChangePasswordModal.tsx` (L19, L46, L89), `src/components/auth/LoginForm.tsx` (L68), `src/components/ui/Modal.tsx`, `src/app/page.tsx` (nav L246-270, panel L397), `src/app/layout.tsx`

**Steps**

- [ ] **Step 1: Write the failing test `src/lib/auth/password.test.ts`** (TDD). Full code:

```ts
import { describe, test, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from './password';

describe('password length policy', () => {
  test('minimum is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
  test('rejects 7, accepts 8', () => {
    expect(validatePasswordLength('1234567')).toBe(false);
    expect(validatePasswordLength('12345678')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** `npm test -- src/lib/auth/password.test.ts`. Expected: `Failed to resolve import "./password"`.
- [ ] **Step 3: Write `src/lib/auth/password.ts`.** Full code:

```ts
export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordLength(pw: string): boolean {
  return pw.length >= PASSWORD_MIN_LENGTH;
}
```

- [ ] **Step 4: Run the test, expect PASS.** `npm test -- src/lib/auth/password.test.ts`. Expected: 2 tests green.
- [ ] **Step 5: Apply min-8 in `LoginForm.tsx`.** Add the import and replace the `password.length < 6` guard (L68):

```ts
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from '@/lib/auth/password';
```

```ts
    if (!validatePasswordLength(password)) {
      setLocalError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
```

- [ ] **Step 6: Apply min-8 + heading fix in `ChangePasswordModal.tsx`.** Add the import; replace the L19 guard, the L46 heading, and the L89 helper copy:

```ts
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from '@/lib/auth/password';
```

L19 guard:

```ts
    if (!validatePasswordLength(newPassword)) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
```

L46 heading (spec §8 check 2):

```tsx
          <h2 className="text-3xl font-bold text-bloc-navy">Set a New Password</h2>
```

L89 helper text:

```tsx
              <p className="mt-1 text-xs text-gray-500">Must be at least {PASSWORD_MIN_LENGTH} characters</p>
```

- [ ] **Step 7: Add a focus trap + focus restore to `Modal.tsx`.** Replace the body of `src/components/ui/Modal.tsx` `useEffect`/render so the dialog autoFocuses, traps Tab, and restores focus on close:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    // autoFocus the first focusable element (or the dialog itself).
    const focusable = getFocusable();
    (focusable[0] ?? dialogRef.current)?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(
          'relative w-full bg-white rounded-2xl shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-200 outline-none',
          sizeStyles[size]
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add ARIA tablist semantics to the desktop nav** (`src/app/page.tsx` L246-270). Add `role="tablist"` to the `<div className="flex -mb-px overflow-x-auto">`, and on each nav `<button>` add `role="tab"`, `aria-selected={activeTab === tab.id}`, `id={`tab-${tab.id}`}`, and `aria-controls="tabpanel"`:

```tsx
            <div className="flex -mb-px overflow-x-auto" role="tablist" aria-label="Dashboard sections">
              {tabs.map((tab, i) => (
                <div key={tab.id} className="flex items-center">
                  {groupBoundaries.has(i) && (
                    <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/20 self-center" />
                  )}
                  <button
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls="tabpanel"
                    onClick={() => setActiveTab(tab.id)}
                    title={`${GROUP_LABEL[tab.group]} · ${tab.label}`}
                    className={`flex items-center gap-2 px-3 lg:px-4 py-4 border-b-2 transition-all font-medium text-sm whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-white text-white bg-white/10'
                        : 'border-transparent text-blue-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                </div>
              ))}
            </div>
```

And mark the content panel (L396-397 `<main>` area) as the tabpanel:

```tsx
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div id="tabpanel" role="tabpanel" aria-labelledby={currentTab ? `tab-${currentTab.id}` : undefined}>
          {currentTab?.component}
        </div>
        <BackToTop />
      </main>
```

- [ ] **Step 9: Load `next/font` in `layout.tsx`.** Replace `src/app/layout.tsx` to apply Inter via the font-class variable (keeping `font-sans` on the body):

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'BLOC Membership Dashboard | Business Leaders of Charlotte',
  description:
    'Membership management dashboard for Business Leaders of Charlotte (BLOC). Track members, manage guest pipeline, and drive growth.',
  keywords: ['BLOC', 'Business Leaders of Charlotte', 'networking', 'Charlotte business', 'membership'],
  authors: [{ name: 'BLOC Membership Team' }],
  openGraph: {
    title: 'BLOC Membership Dashboard',
    description: 'Building friendships, growing business, and strengthening our community.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Verify the polish (concrete checks).** Run `npm test -- src/lib/auth/password.test.ts` (green). `grep -rn "at least 6 characters" src/` → NO matches; `grep -rn "Welcome to BLOC" src/` → NO matches; `grep -n "role=\"tablist\"\|role=\"tab\"\|aria-selected" src/app/page.tsx` → 3+ matches; `grep -n "next/font" src/app/layout.tsx` → 1 match. Manual: open any Modal (e.g. Add Guest), confirm focus lands inside, Tab cycles within the dialog, Escape closes, and focus returns to the trigger.
- [ ] **Step 11: Commit.** `git add src/lib/auth/password.ts src/lib/auth/password.test.ts src/components/auth/ChangePasswordModal.tsx src/components/auth/LoginForm.tsx src/components/ui/Modal.tsx src/app/page.tsx src/app/layout.tsx` then `git commit -m "feat(ux): min-8 password, 'Set a New Password' heading, modal focus trap, ARIA tablist, next/font"`.

---

## Task 10 — P0-e: Regenerate `database.types.ts` and thread the `Database` type

Current types are stale (missing `member_type`, nullable chapter, scanner/intake/qr/rsvp/visibility tables) and imported nowhere (spec §2 P0-e). Regenerate from the live schema, wire `createClient<Database>`, and replace `row: any` in the two hooks. Ships LAST in this PR because it's type-only and surfaces latent type errors across the touched files.

**Files**
- Modify: `src/lib/database.types.ts` (full regenerate)
- Modify: `src/lib/supabase.ts` (L10 `createClient`)
- Modify: `src/hooks/useMembers.ts` (`transformDbToMember(row: any)` L10), `src/hooks/useGuests.ts` (`transformDbToGuest/transformGuestToDb(row: any)` L10, L28)

**Steps**

- [ ] **Step 1: Generate types from the live schema.** Use the Supabase MCP `generate_typescript_types` for project `ksmtkisknnvrjdfigsll`. Save the full returned TypeScript as `src/lib/database.types.ts`, replacing the stale file entirely. Confirm the new file includes the `members.member_type` column, a nullable `members.chapter`, and the `business_card_scans`, `intake_*`, `qr_tokens`, `chapter_member_visibility`, `events` tables.
- [ ] **Step 2: Thread `Database` into the client.** In `src/lib/supabase.ts` add the import and type-param:

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Running in demo mode.');
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const isSupabaseConfigured = () => {
  return !!supabaseUrl && !!supabaseAnonKey;
};

export { isDemoMode } from './demo-mode';
```

- [ ] **Step 3: Type the member transform.** In `src/hooks/useMembers.ts`, replace `row: any` with the generated row type:

```ts
import type { Database } from '@/lib/database.types';

type MemberRow = Database['public']['Tables']['members']['Row'];

function transformDbToMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    chapter: (row.chapter ?? null) as ChapterName | null,
    memberType: row.member_type === 'after_hours' ? 'after_hours' : 'full',
    industry: row.industry,
    email: row.email || undefined,
    phone: row.phone || undefined,
    title: row.title || undefined,
    website: row.website || undefined,
    description: row.description || undefined,
    address: row.address || undefined,
    mobilePhone: row.mobile_phone || undefined,
    birthday: row.birthday || undefined,
    memberSince: row.member_since || undefined,
    renewalDue: row.renewal_due || undefined,
    referredBy: row.referred_by || undefined,
  };
}
```

(If the generated `MemberRow` lacks a field referenced here, that proves the live schema diverges — reconcile by regenerating, not by reverting to `any`.)

- [ ] **Step 4: Type the guest transforms.** In `src/hooks/useGuests.ts`:

```ts
import type { Database } from '@/lib/database.types';

type GuestRow = Database['public']['Tables']['guests']['Row'];
type GuestInsert = Database['public']['Tables']['guests']['Insert'];

function transformDbToGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    industry: row.industry || '',
    invitedBy: row.invited_by,
    email: row.email || '',
    phone: row.phone || '',
    status: row.status as GuestStatus,
    nextStep: row.next_step,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformGuestToDb(guest: Partial<Guest>): Partial<GuestInsert> {
  const result: Partial<GuestInsert> = {};
  if (guest.name !== undefined) result.name = guest.name;
  if (guest.company !== undefined) result.company = guest.company;
  if (guest.industry !== undefined) result.industry = guest.industry || null;
  if (guest.invitedBy !== undefined) result.invited_by = guest.invitedBy;
  if (guest.email !== undefined) result.email = guest.email || null;
  if (guest.phone !== undefined) result.phone = guest.phone || null;
  if (guest.status !== undefined) result.status = guest.status;
  if (guest.nextStep !== undefined) result.next_step = guest.nextStep;
  if (guest.notes !== undefined) result.notes = guest.notes || null;
  return result;
}
```

- [ ] **Step 5: Type-check the whole app (concrete check).** Run `npx tsc --noEmit`. Expected: exit code 0. If the regenerated types surface a real mismatch in a touched file, fix that file (do not re-add `any`); record any pre-existing unrelated error as out of scope.
- [ ] **Step 6: Run the full test suite.** Run `npm test`. Expected: all suites pass (`demo-mode`, `pipeline/stages`, `auth/password`, `api/requireAdmin`, plus the pre-existing `summary`, `datetime`, `csv`, `share` tests).
- [ ] **Step 7: Smoke the typed client (spec §8 check 5 again).** `npm run dev`, log in as `member`, confirm the Members tab loads the real fingerprint row (Task 4 Step 9) and the build has no runtime type errors in the console.
- [ ] **Step 8: Commit.** `git add src/lib/database.types.ts src/lib/supabase.ts src/hooks/useMembers.ts src/hooks/useGuests.ts` then `git commit -m "refactor(types): regenerate database.types.ts; thread Database type; drop row:any"`.

---

## Task 11 — Final PR verification & cleanup

Roll up the Go/No-Go checks relevant to this workstream before opening the PR. Confirm the spine is untouched.

**Steps**

- [ ] **Step 1: Full green suite + typecheck.** Run `npm test` (all pass) and `npx tsc --noEmit` (exit 0) and `npm run build` (succeeds).
- [ ] **Step 2: Assert the spine is untouched (spec §1.3, §7 row 5).** Run `git diff --name-only main...HEAD | grep -E "001_schema|005_fix_rls_recursion"` — expected: NO output (neither `handle_new_user`/trigger nor the three helpers were modified). Run via `execute_sql`: `SELECT proname FROM pg_proc WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter','handle_new_user');` — expected: all 4 present, unchanged.
- [ ] **Step 3: Assert no new policy inlines a profiles self-select.** Run `grep -rn "FROM profiles" supabase/migrations/017_scanner_enhancements.sql supabase/migrations/018_events_reconcile.sql` — expected: NO matches (these two migrations add no policies).
- [ ] **Step 4: Counts unchanged (spec §8 check 8).** Run via `execute_sql`: `SELECT (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM guests) AS guests, (SELECT COUNT(*) FROM events) AS events;` and confirm members/guests/events match the pre-PR snapshot (only the deliberate fingerprint row added to `members`).
- [ ] **Step 5: Open the PR** on a feature branch (not default). `git push -u origin phase0-stabilize-polish` then `gh pr create --title "Phase 0 — Stabilize & Polish (P0-a … P0-j)" --body "<summary mapping each commit to its P0 item + the Done-when checks>"`.

---

## Done when

These map to the spec §8 Go/No-Go checks that this Phase 0 workstream owns (the identity/lead/RLS-spine checks belong to later PRs):

- **§8.1 Login works (all 3 roles); provisioning intact.** Self-signup is closed (Task 5) and `handle_new_user` is verified unchanged (Task 11 Step 2); admin/director/member all pass `AuthGuard`.
- **§8.2 `must_change_password` gates; heading reads "Set a New Password".** Task 9 Steps 6, 10.
- **§8.3 Tabs per role; `#hash` deep-links resolve; Most Wanted/Pipeline absent for members, present for staff.** Task 7 Steps 4-5.
- **§8.5 Real data, not fabricated (the key check).** Static-PII fallback removed behind `NEXT_PUBLIC_DEMO_MODE` (Task 4); a DB-only fingerprint row is visible to each role and an over-tightened/empty read renders an explicit empty state, never the static list (Task 4 Steps 8-10, re-smoked in Task 10 Step 7).
- **§8.7 Public wizard anon reads intact.** `events_public_read`/`events_auth_read` preserved through the `018` reconcile (Task 3 Step 5).
- **§8.8 Counts / 125 goal unchanged.** members/guests/events row counts identical pre/post except the deliberate fingerprint (Task 3 Step 6, Task 11 Step 4).
- **§8.10 Helpers untouched; WA routes 401/403/200.** The three `005` helpers + trigger verified intact (Task 11 Step 2); `/api/wa/*` returns 401 (no token) / 403 (member) / 200 (admin) (Task 6 Step 7).
- **Reproducible rebuild + scanner no longer 500s + no hidden kanban stages.** Stray `008` token removed (Task 1), scanner write-columns promoted to `017` with `ON DELETE SET NULL` FKs (Task 2), `slice(0,6)` stage-drop fixed (Task 8), and `Database` types threaded so latent errors surface (Task 10). This PR touches none of the identity/lead/RLS spine and is fully reversible.
