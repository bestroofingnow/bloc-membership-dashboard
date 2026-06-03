# Phase 1 — Additive RLS & Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated members browse the whole network by business info while personal PII (mobile phone, address, birthday) is opt-in, lock members out of self-promoting their role/chapter, and give directors read access to their chapter's QR tokens — all additively, with row counts that never drop so the anti-fabrication static fallback can never fire.

**Architecture:** New `member_field_visibility` (booleans-only) table records per-field opt-in. A `SECURITY DEFINER` `directory_members()` function + `member_directory` view returns **every** member row with business fields always present and personal fields NULL unless the caller is admin/director, the owner, or the field is opted-in — same row count as the base table. The `members` read cutover is staged: STEP A leaves the blanket `USING(true)` policy, STEP B points `useMembers` at the directory view, and STEP C (`027`) drops/replaces the blanket policy only after a documented audit confirms every `from('members')` caller is staff-gated or directory/owner-scoped. Two small additive policies lock profile self-edits (`025`) and grant director QR reads (`026`).

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Supabase (Postgres + RLS), Tailwind, vitest. Supabase project ref ksmtkisknnvrjdfigsll.

---

## File Structure

**Migrations (created — canonical numbering from spec §6):**
- `supabase/migrations/023_member_field_visibility.sql` — per-field opt-in table (`show_mobile_phone`, `show_address`, `show_birthday` DEFAULT FALSE); RLS `SELECT USING(true)` for authenticated, no anon, no write policy (service-role only).
- `supabase/migrations/024_member_directory.sql` — `current_user_email()` + `directory_members()` `SECURITY DEFINER` functions and `member_directory` view (same row count as `members`).
- `supabase/migrations/025_profiles_self_edit_lock.sql` — replaces "Users can update own profile" so `WITH CHECK` pins `role` + `chapter`; adds `get_user_role()` helper.
- `supabase/migrations/026_qr_tokens_director_read.sql` — additive `qr_tokens_director_read` policy.
- `supabase/migrations/027_members_select_tighten.sql` — **GATED STEP C**; drops blanket `members` SELECT, adds `members_select_self_and_staff`. Ships only after the reader audit (Task 7) is green.

**Source (created):**
- `src/lib/members/field-visibility.ts` — pure helper `projectFieldVisibility()` + `parseFieldVisibilityInput()` (TDD).
- `src/lib/members/directory.ts` — pure helper `directoryRowToMember()` mapping a `member_directory` row to the `Member` type (TDD).
- `src/app/api/me/field-visibility/route.ts` — member self-service POST upsert of their own visibility flags (mirrors `roster-visibility`).
- `src/app/api/admin/member-field-visibility/route.ts` — admin/director POST for another member's flags (mirrors `chapter-visibility`).
- `src/hooks/useMyFieldVisibility.ts` — client hook reading/writing the caller's flags via the self-service API.

**Source (modified):**
- `src/hooks/useMembers.ts` — STEP B: read from `member_directory`, map via `directoryRowToMember`.
- `src/types/index.ts` — extend `Member` with `mobilePhoneVisible`-irrelevant note (no change needed beyond existing fields; documented).
- `src/components/tabs/MyProfileTab.tsx` — add a per-field visibility section using `useMyFieldVisibility`.

**Reference-only (read, not modified by this workstream):** `src/lib/admin-auth.ts` (`requireDirector`), `src/lib/api/auth.ts` (Phase 0 `requireAdmin` — coordinate, do not redefine), `src/app/api/me/roster-visibility/route.ts` (pattern source), `src/hooks/{useChapterRoster,useSeatMap,useMyMember,useMemberTaxonomyAdmin,useIntakeGuests,useQrTokens,useProfiles}.ts` (audited in Task 7).

> **DEPENDENCY GATE (do not start until verified):** This plan depends on **Phase 0 item P0-g** (silent static-PII fallback removed from `useMembers`/`useGuests`) and on the Phase 0 shared `src/lib/api/auth.ts` (`requireAdmin`). Before Task 1, confirm `useMembers` initializes state with `[]` (not `staticMembers`) when configured and renders an explicit empty state on zero rows. If P0-g is not merged, STOP — STEP B/C are unsafe.

---

## Task 1 — Pure field-visibility projection helper (TDD)

The directory projection logic (which personal fields a given viewer may see) is pure and must be unit-tested before any SQL relies on it. The SQL in Task 3 mirrors this exact precedence: `owner OR staff` sees all; otherwise a field is visible only if its opt-in flag is true.

**Files:**
- Create: `src/lib/members/field-visibility.ts`
- Create: `src/lib/members/field-visibility.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `src/lib/members/field-visibility.test.ts` with the FULL contents:

```ts
import { describe, test, expect } from 'vitest';
import {
  projectFieldVisibility,
  parseFieldVisibilityInput,
  type FieldVisibilityFlags,
  type ViewerContext,
  type PersonalFields,
} from './field-visibility';

const personal: PersonalFields = {
  mobile_phone: '704-555-1212',
  address: '1 Main St',
  birthday: '03/14',
};

const allHidden: FieldVisibilityFlags = {
  show_mobile_phone: false,
  show_address: false,
  show_birthday: false,
};

describe('projectFieldVisibility()', () => {
  test('owner sees every personal field regardless of flags', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: true };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual(personal);
  });

  test('staff (admin/director) sees every personal field regardless of flags', () => {
    const viewer: ViewerContext = { isStaff: true, isOwner: false };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual(personal);
  });

  test('non-owner non-staff sees nulls when all flags are false (default = hidden)', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    expect(projectFieldVisibility(personal, allHidden, viewer)).toEqual({
      mobile_phone: null,
      address: null,
      birthday: null,
    });
  });

  test('non-owner non-staff sees only the opted-in fields', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    const flags: FieldVisibilityFlags = {
      show_mobile_phone: true,
      show_address: false,
      show_birthday: true,
    };
    expect(projectFieldVisibility(personal, flags, viewer)).toEqual({
      mobile_phone: '704-555-1212',
      address: null,
      birthday: '03/14',
    });
  });

  test('mobile_phone is a personal (opt-in) field, never always-visible', () => {
    const viewer: ViewerContext = { isStaff: false, isOwner: false };
    const flags: FieldVisibilityFlags = {
      show_mobile_phone: false,
      show_address: true,
      show_birthday: true,
    };
    expect(projectFieldVisibility(personal, flags, viewer).mobile_phone).toBeNull();
  });
});

describe('parseFieldVisibilityInput()', () => {
  test('coerces present booleans and defaults missing ones to false', () => {
    expect(parseFieldVisibilityInput({ show_address: true })).toEqual({
      show_mobile_phone: false,
      show_address: true,
      show_birthday: false,
    });
  });

  test('ignores non-boolean junk and never returns undefined flags', () => {
    expect(
      parseFieldVisibilityInput({ show_mobile_phone: 'yes', show_birthday: 1, extra: 'x' } as unknown as Record<string, unknown>)
    ).toEqual({
      show_mobile_phone: false,
      show_address: false,
      show_birthday: false,
    });
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** Run:

```bash
npm test -- src/lib/members/field-visibility.test.ts
```

Expected: the run fails to resolve the module with an error like `Failed to resolve import "./field-visibility"` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `src/lib/members/field-visibility.ts` with the FULL contents:

```ts
/**
 * Pure projection of a member's personal fields for a given viewer.
 *
 * Precedence (mirrored exactly by directory_members() in migration 024):
 *  - owner (lower(email) = current_user_email()) OR staff (admin/director) => all fields
 *  - otherwise each field is visible only when its opt-in flag is true
 *  - absence of any flag => hidden (default privacy)
 *
 * NOTE: mobile_phone is classified PERSONAL (decided 2026-06-03), so it is
 * gated identically to address and birthday — never always-visible.
 */

export interface PersonalFields {
  mobile_phone: string | null;
  address: string | null;
  birthday: string | null;
}

export interface FieldVisibilityFlags {
  show_mobile_phone: boolean;
  show_address: boolean;
  show_birthday: boolean;
}

export interface ViewerContext {
  isStaff: boolean;
  isOwner: boolean;
}

export function projectFieldVisibility(
  fields: PersonalFields,
  flags: FieldVisibilityFlags,
  viewer: ViewerContext,
): PersonalFields {
  const seeAll = viewer.isStaff || viewer.isOwner;
  return {
    mobile_phone: seeAll || flags.show_mobile_phone ? fields.mobile_phone : null,
    address: seeAll || flags.show_address ? fields.address : null,
    birthday: seeAll || flags.show_birthday ? fields.birthday : null,
  };
}

/** Coerce an untrusted body into a complete flag set; anything non-true => false. */
export function parseFieldVisibilityInput(
  input: Record<string, unknown>,
): FieldVisibilityFlags {
  return {
    show_mobile_phone: input.show_mobile_phone === true,
    show_address: input.show_address === true,
    show_birthday: input.show_birthday === true,
  };
}
```

- [ ] **Step 4: Run the test, expect PASS.** Run:

```bash
npm test -- src/lib/members/field-visibility.test.ts
```

Expected: `Test Files  1 passed (1)` and `Tests  7 passed (7)`.

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add src/lib/members/field-visibility.ts src/lib/members/field-visibility.test.ts
git commit -m "feat(members): pure field-visibility projection helper (Phase 1 §5.1)"
```

---

## Task 2 — Migration `023_member_field_visibility.sql` (per-field opt-in table)

Booleans only, no PII. Authenticated read is `USING(true)` (flags are not sensitive). No write policy — all writes go through service-role API routes (Tasks 5/6). Mirrors the additive shape of `013_chapter_member_visibility.sql`.

**Files:**
- Create: `supabase/migrations/023_member_field_visibility.sql`

**Steps:**

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/023_member_field_visibility.sql` with the FULL contents:

```sql
-- ============================================================
-- Migration 023: Per-field personal-PII opt-in (Phase 1 §5.1)
--
-- Absence of a row = all personal fields hidden (the desired default).
-- mobile_phone is PERSONAL (decided 2026-06-03), gated like address/birthday.
-- Booleans only (no PII) so authenticated SELECT USING(true) is safe.
-- Writes go only through the service-role API (no anon, no auth write policy).
-- ============================================================

CREATE TABLE IF NOT EXISTS member_field_visibility (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  show_mobile_phone BOOLEAN NOT NULL DEFAULT FALSE,
  show_address BOOLEAN NOT NULL DEFAULT FALSE,
  show_birthday BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_field_visibility ENABLE ROW LEVEL SECURITY;

-- Flags are not sensitive; any authenticated user may read them (the directory
-- function below needs them to project the personal columns).
DROP POLICY IF EXISTS "mfv_auth_read" ON member_field_visibility;
CREATE POLICY "mfv_auth_read" ON member_field_visibility
  FOR SELECT TO authenticated
  USING (TRUE);

-- Intentionally NO anon policy and NO authenticated INSERT/UPDATE/DELETE policy.
-- Service-role API routes (bypass RLS) own all writes.
```

- [ ] **Step 2: Apply the migration.** Apply via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `023_member_field_visibility`) with the SQL from Step 1.

- [ ] **Step 3: Verify the table + RLS exist.** Run via the Supabase MCP `execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='member_field_visibility'
       AND column_name IN ('member_id','show_mobile_phone','show_address','show_birthday','updated_by','updated_at')) AS col_count,
  (SELECT relrowsecurity FROM pg_class WHERE relname='member_field_visibility') AS rls_enabled,
  (SELECT count(*) FROM pg_policies
     WHERE tablename='member_field_visibility') AS policy_count;
```

Expected: `col_count = 6`, `rls_enabled = true`, `policy_count = 1` (only `mfv_auth_read`, confirming no write/anon policy exists).

- [ ] **Step 4: Verify default-hidden semantics.** Run via `execute_sql`:

```sql
SELECT count(*) AS rows_with_any_default_true
FROM member_field_visibility
WHERE show_mobile_phone OR show_address OR show_birthday;
```

Expected: `0` (a fresh table; absence of a row means hidden, so no row should opt anything in yet).

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add supabase/migrations/023_member_field_visibility.sql
git commit -m "feat(db): 023 member_field_visibility opt-in table (Phase 1 §5.1)"
```

---

## Task 3 — Migration `024_member_directory.sql` (projection RPC + view, same row count)

`current_user_email()` + `directory_members()` `SECURITY DEFINER`. The function returns **every** `members` row with business fields always present and personal fields (`mobile_phone`, `address`, `birthday`) non-null only for staff (via `005` helpers), the owner (`lower(email)=current_user_email()`), or an opted-in field. The `member_directory` view returns the same row count as `members` so `useMembers`' `data.length>0` guard always holds. NOTE: the schema's business contact columns are `email`/`phone` (there is no `business_email`/`business_phone`); the directory exposes them under the business-always-visible set.

**Files:**
- Create: `supabase/migrations/024_member_directory.sql`

**Steps:**

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/024_member_directory.sql` with the FULL contents:

```sql
-- ============================================================
-- Migration 024: Member directory projection (Phase 1 §5.2)
--
-- Business fields (name, company, chapter, member_type, industry, title,
-- website, email, phone) are ALWAYS present. Personal fields
-- (mobile_phone, address, birthday) are non-null only when the caller is:
--   * admin/director (reuses 005 helpers), OR
--   * the owner (lower(email) = current_user_email()), OR
--   * the field is opted in via member_field_visibility.
--
-- CRITICAL INVARIANT: returns the SAME ROW COUNT as members (column-nulling
-- only, never row removal) so useMembers' data.length>0 guard holds and the
-- static fallback can never be triggered by this projection.
-- ============================================================

-- Owner self-view helper. SECURITY DEFINER + search_path pinned so it reads
-- auth.users regardless of the caller's RLS. Does NOT touch the 005 helpers.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid();
$$;

-- The projection. One row per member (LEFT JOIN so members without a
-- visibility row still appear — absence = all personal fields hidden).
CREATE OR REPLACE FUNCTION public.directory_members()
RETURNS TABLE (
  id UUID,
  name TEXT,
  company TEXT,
  chapter TEXT,
  member_type TEXT,
  industry TEXT,
  title TEXT,
  website TEXT,
  description TEXT,
  email TEXT,
  phone TEXT,
  industry_id UUID,
  category_id UUID,
  member_since TEXT,
  renewal_due TEXT,
  referred_by TEXT,
  mobile_phone TEXT,
  address TEXT,
  birthday TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.company,
    m.chapter,
    m.member_type,
    m.industry,
    m.title,
    m.website,
    m.description,
    m.email,
    m.phone,
    m.industry_id,
    m.category_id,
    m.member_since,
    m.renewal_due,
    m.referred_by,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_mobile_phone, FALSE)
         THEN m.mobile_phone ELSE NULL END AS mobile_phone,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_address, FALSE)
         THEN m.address ELSE NULL END AS address,
    CASE WHEN public.is_admin() OR public.is_chapter_director()
              OR lower(m.email) = public.current_user_email()
              OR COALESCE(v.show_birthday, FALSE)
         THEN m.birthday ELSE NULL END AS birthday
  FROM public.members m
  LEFT JOIN public.member_field_visibility v ON v.member_id = m.id;
$$;

-- Stable view surface for the client. Same row count as members.
CREATE OR REPLACE VIEW public.member_directory AS
  SELECT * FROM public.directory_members();

-- Only authenticated callers may read the directory. The function's
-- SECURITY DEFINER body still nulls personal columns per the rules above.
REVOKE ALL ON FUNCTION public.directory_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_members() TO authenticated;
REVOKE ALL ON public.member_directory FROM PUBLIC, anon;
GRANT SELECT ON public.member_directory TO authenticated;
```

- [ ] **Step 2: Apply the migration.** Apply via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `024_member_directory`) with the SQL from Step 1.

- [ ] **Step 3: Verify SAME ROW COUNT (the fabrication-prevention invariant).** Run via `execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM public.members) AS members_count,
  (SELECT count(*) FROM public.member_directory) AS directory_count,
  (SELECT count(*) FROM public.members)
    = (SELECT count(*) FROM public.member_directory) AS counts_match;
```

Expected: `counts_match = true` and `members_count = directory_count`. **If these differ, STOP** — the directory is dropping rows and would trigger the static fallback; do not proceed.

- [ ] **Step 4: Verify business fields are always non-null and helpers untouched.** Run via `execute_sql`:

```sql
-- Business columns must be present for every row (we only ever null personal cols).
SELECT count(*) AS rows_missing_business_name_or_company
FROM public.member_directory
WHERE name IS NULL OR company IS NULL;

-- Confirm the 005 helper signatures are unchanged (we reuse, never redefine).
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter','current_user_email','directory_members')
ORDER BY proname;
```

Expected: `rows_missing_business_name_or_company = 0`; the second query lists `is_admin()`, `is_chapter_director()`, `get_user_chapter()` with **no arguments** (identical to `005`) plus the two new functions `current_user_email()` and `directory_members()`.

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add supabase/migrations/024_member_directory.sql
git commit -m "feat(db): 024 member_directory projection (same row count) (Phase 1 §5.2)"
```

---

## Task 4 — Directory row→Member mapper (TDD) + STEP B: point `useMembers` at the view

STEP B is the paired client change in the same release as the directory: `useMembers` reads `member_directory` instead of `members`. Because the view returns the same row count, `data.length>0` still holds; the only difference is personal columns arrive NULL for non-permitted viewers (rendered as "hidden", never fabricated). The blanket `members` SELECT policy is left intact (STEP A) — that drop is deferred to `027` (Task 8).

**Files:**
- Create: `src/lib/members/directory.ts`
- Create: `src/lib/members/directory.test.ts`
- Modify: `src/hooks/useMembers.ts` (the `transformDbToMember` at L10-30 and the `.from('members').select('*')` at L46-49)

**Steps:**

- [ ] **Step 1: Write the failing mapper test.** Create `src/lib/members/directory.test.ts` with the FULL contents:

```ts
import { describe, test, expect } from 'vitest';
import { directoryRowToMember, type DirectoryRow } from './directory';

const baseRow: DirectoryRow = {
  id: 'm1',
  name: 'Jane Doe',
  company: 'Doe Co',
  chapter: 'North',
  member_type: 'full',
  industry: 'Roofing',
  title: 'Owner',
  website: 'doe.co',
  description: 'desc',
  email: 'jane@doe.co',
  phone: '704-555-0001',
  industry_id: null,
  category_id: null,
  member_since: '2020',
  renewal_due: '2026',
  referred_by: 'Bob',
  mobile_phone: null,
  address: null,
  birthday: null,
};

describe('directoryRowToMember()', () => {
  test('maps business fields and leaves nulled personal fields undefined', () => {
    const m = directoryRowToMember(baseRow);
    expect(m).toMatchObject({
      id: 'm1',
      name: 'Jane Doe',
      company: 'Doe Co',
      chapter: 'North',
      memberType: 'full',
      industry: 'Roofing',
      title: 'Owner',
      website: 'doe.co',
      email: 'jane@doe.co',
      phone: '704-555-0001',
      memberSince: '2020',
      renewalDue: '2026',
      referredBy: 'Bob',
    });
    expect(m.mobilePhone).toBeUndefined();
    expect(m.address).toBeUndefined();
    expect(m.birthday).toBeUndefined();
  });

  test('after_hours maps to after_hours; null chapter preserved', () => {
    const m = directoryRowToMember({ ...baseRow, member_type: 'after_hours', chapter: null });
    expect(m.memberType).toBe('after_hours');
    expect(m.chapter).toBeNull();
  });

  test('any unknown member_type falls back to full', () => {
    const m = directoryRowToMember({ ...baseRow, member_type: 'weird' as DirectoryRow['member_type'] });
    expect(m.memberType).toBe('full');
  });

  test('present personal fields are surfaced (owner/staff/opted-in case)', () => {
    const m = directoryRowToMember({
      ...baseRow,
      mobile_phone: '704-555-9999',
      address: '1 Main St',
      birthday: '03/14',
    });
    expect(m.mobilePhone).toBe('704-555-9999');
    expect(m.address).toBe('1 Main St');
    expect(m.birthday).toBe('03/14');
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** Run:

```bash
npm test -- src/lib/members/directory.test.ts
```

Expected: failure resolving `./directory` (`Failed to resolve import "./directory"`).

- [ ] **Step 3: Write the mapper.** Create `src/lib/members/directory.ts` with the FULL contents:

```ts
import type { Member, ChapterName } from '@/types';

/** A row from the member_directory view (migration 024). Personal columns may
 *  be NULL when the viewer is not the owner/staff and has not been opted in. */
export interface DirectoryRow {
  id: string;
  name: string;
  company: string;
  chapter: string | null;
  member_type: string;
  industry: string;
  title: string | null;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  industry_id: string | null;
  category_id: string | null;
  member_since: string | null;
  renewal_due: string | null;
  referred_by: string | null;
  mobile_phone: string | null;
  address: string | null;
  birthday: string | null;
}

/** Map a directory row to the app Member type. NULL personal columns become
 *  undefined so the UI renders them as absent (never as fabricated values). */
export function directoryRowToMember(row: DirectoryRow): Member {
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

- [ ] **Step 4: Run the test, expect PASS.** Run:

```bash
npm test -- src/lib/members/directory.test.ts
```

Expected: `Tests  4 passed (4)`.

- [ ] **Step 5: Point `useMembers` at the view.** In `src/hooks/useMembers.ts`, replace the local `transformDbToMember` (L10-30) usage and the read. First add the import near the existing imports (after line 8, `import { summarizeMembers } from '@/lib/members/summary';`):

```ts
import { directoryRowToMember, type DirectoryRow } from '@/lib/members/directory';
```

Then change the read in `fetchMembers` (current L46-55). Replace:

```ts
      const { data, error: fetchError } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else if (data && data.length > 0) {
        setMembers(data.map(transformDbToMember));
      }
      // If empty, keep static fallback data
```

with:

```ts
      const { data, error: fetchError } = await supabase
        .from('member_directory')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else {
        // STEP B: read the column-nulling directory view. Same row count as
        // members, so an empty result is a real empty state (P0-g), never the
        // static fallback.
        setMembers((data ?? []).map((r) => directoryRowToMember(r as DirectoryRow)));
      }
```

- [ ] **Step 6: Repoint the realtime INSERT/UPDATE mapper.** The realtime subscription at L77-89 still maps `payload.new` (a raw `members` row) via `transformDbToMember`. Keep `transformDbToMember` (its raw-row shape matches `members` realtime payloads), so no change is required there — but verify it still compiles. Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
npx tsc --noEmit
```

Expected: no errors referencing `useMembers.ts` or `directory.ts`. (If `transformDbToMember` becomes unused because nothing else calls it, TypeScript will not error; leave it for the realtime path which still uses it at L79 and L82.)

- [ ] **Step 7: Smoke-verify the read returns real rows (anti-fabrication check).** Run via `execute_sql` to confirm a non-empty directory in prod-equivalent data:

```sql
SELECT count(*) AS directory_rows FROM public.member_directory;
```

Expected: a positive integer equal to the live member count (matches Task 3 Step 3). This confirms STEP B will render real rows, not an empty state and not the static list.

- [ ] **Step 8: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add src/lib/members/directory.ts src/lib/members/directory.test.ts src/hooks/useMembers.ts
git commit -m "feat(members): STEP B read member_directory view; row count preserved (Phase 1 §5.3)"
```

---

## Task 5 — Member self-service field-visibility write API

Mirrors the exact bearer→`getUser`→email-match→service-role-upsert pattern from `src/app/api/me/roster-visibility/route.ts` (L19-73). The member toggles only their OWN flags, identified by matching their auth email to `members.email` (case-insensitive). No browser anon write surface.

**Files:**
- Create: `src/app/api/me/field-visibility/route.ts`

**Steps:**

- [ ] **Step 1: Write the route.** Create `src/app/api/me/field-visibility/route.ts` with the FULL contents:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';

const schema = z.object({
  show_mobile_phone: z.boolean(),
  show_address: z.boolean(),
  show_birthday: z.boolean(),
});

/**
 * Member self-service: any authenticated user toggles their OWN row in
 * member_field_visibility. Identified by matching their auth email to
 * members.email (case-insensitive). They cannot touch another member's flags.
 * Pattern copied verbatim from /api/me/roster-visibility.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // Find the caller's member record by email (case-insensitive).
  const { data: memRow } = await sb
    .from('members')
    .select('id')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) {
    return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });
  }

  const { error: upErr } = await sb
    .from('member_field_visibility')
    .upsert({
      member_id: memRow.id,
      show_mobile_phone: p.show_mobile_phone,
      show_address: p.show_address,
      show_birthday: p.show_birthday,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id' });
  if (upErr) {
    console.error('me field-visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify 401 without a token.** With the dev server running (`npm run dev`), run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/me/field-visibility \
  -H 'content-type: application/json' \
  -d '{"show_mobile_phone":true,"show_address":false,"show_birthday":false}'
```

Expected: `401` (no Authorization header → unauthorized).

- [ ] **Step 3: Verify 400 with a token but bad body.** Run (replace `$JWT` with a real member session access token from the browser devtools `supabase.auth.getSession()`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/me/field-visibility \
  -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"show_mobile_phone":"yes"}'
```

Expected: `400` (Zod rejects the non-boolean / missing fields).

- [ ] **Step 4: Verify a real opt-in round-trips to the DB.** Run the valid request (real member `$JWT`):

```bash
curl -s -X POST http://localhost:3000/api/me/field-visibility \
  -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"show_mobile_phone":true,"show_address":false,"show_birthday":false}'
```

Expected body: `{"ok":true}`. Then confirm via `execute_sql`:

```sql
SELECT show_mobile_phone, show_address, show_birthday
FROM member_field_visibility
WHERE member_id = (SELECT id FROM members WHERE lower(email) = lower('<that member email>') LIMIT 1);
```

Expected: one row with `show_mobile_phone = true`, others `false`.

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add src/app/api/me/field-visibility/route.ts
git commit -m "feat(api): member self-service field-visibility write (Phase 1 §5.6)"
```

---

## Task 6 — Admin/director field-visibility write API

Admin/director edits of another member's flags go through an admin route with an explicit `is_admin/is_chapter_director` check, reusing `requireDirector` from `src/lib/admin-auth.ts` and chapter-scoping directors exactly as `chapter-visibility` does (a director may only edit a member in their own chapter).

**Files:**
- Create: `src/app/api/admin/member-field-visibility/route.ts`

**Steps:**

- [ ] **Step 1: Write the route.** Create `src/app/api/admin/member-field-visibility/route.ts` with the FULL contents:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const schema = z.object({
  member_id: z.string().uuid(),
  show_mobile_phone: z.boolean(),
  show_address: z.boolean(),
  show_birthday: z.boolean(),
});

/**
 * Admin/director edits of ANOTHER member's field-visibility flags.
 * Admins may edit anyone; directors only members in their own chapter.
 * Mirrors the chapter-scope guard from /api/admin/chapter-visibility.
 */
export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // Resolve the target member's chapter for the director scope check.
  const { data: target } = await sb
    .from('members')
    .select('id,chapter')
    .eq('id', p.member_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  const inScope = profile.role === 'admin' || profile.chapter === target.chapter;
  if (!inScope) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const { error: upErr } = await sb
    .from('member_field_visibility')
    .upsert({
      member_id: p.member_id,
      show_mobile_phone: p.show_mobile_phone,
      show_address: p.show_address,
      show_birthday: p.show_birthday,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id' });
  if (upErr) {
    console.error('admin member-field-visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify 401 without a token.** With `npm run dev` running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/member-field-visibility \
  -H 'content-type: application/json' \
  -d '{"member_id":"00000000-0000-0000-0000-000000000000","show_mobile_phone":true,"show_address":false,"show_birthday":false}'
```

Expected: `401`.

- [ ] **Step 3: Verify 401 for a plain member token.** Run with a member (non-staff) `$MEMBER_JWT`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/member-field-visibility \
  -H "authorization: Bearer $MEMBER_JWT" -H 'content-type: application/json' \
  -d '{"member_id":"00000000-0000-0000-0000-000000000000","show_mobile_phone":true,"show_address":false,"show_birthday":false}'
```

Expected: `401` (`requireDirector` returns null for `role='member'`).

- [ ] **Step 4: Verify 200 for an admin editing a real member.** Run with an admin `$ADMIN_JWT` and a real `<member-uuid>`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/member-field-visibility \
  -H "authorization: Bearer $ADMIN_JWT" -H 'content-type: application/json' \
  -d '{"member_id":"<member-uuid>","show_mobile_phone":false,"show_address":true,"show_birthday":false}'
```

Expected: `200`.

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add src/app/api/admin/member-field-visibility/route.ts
git commit -m "feat(api): admin/director member-field-visibility write, chapter-scoped (Phase 1 §5.6)"
```

---

## Task 7 — Migration `025_profiles_self_edit_lock.sql` (pin role + chapter)

Replace "Users can update own profile" (migration `001:177-181`) so the `WITH CHECK` pins `role` and `chapter` to their current values — a member may edit `full_name` and clear `must_change_password` but cannot self-promote. The "Admins can manage all profiles" policy (`005:46-49`) is untouched, so admin role management still works. Add an additive `get_user_role()` `SECURITY DEFINER` helper (mirroring `get_user_chapter`) used in the `WITH CHECK` to avoid any self-referential `profiles` subquery recursion; the existing three `005` helpers are not modified.

**Files:**
- Create: `supabase/migrations/025_profiles_self_edit_lock.sql`

**Steps:**

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/025_profiles_self_edit_lock.sql` with the FULL contents:

```sql
-- ============================================================
-- Migration 025: Profile self-edit lock (Phase 1 §5.4)
--
-- Members may edit their own full_name / clear must_change_password, but
-- cannot self-promote: the WITH CHECK pins role and chapter to their CURRENT
-- values via SECURITY DEFINER helpers (no self-referential profiles subquery,
-- so we never re-trigger the recursion that 005 fixed).
--
-- The 005 "Admins can manage all profiles" policy is UNTOUCHED — admin role
-- management still works. The three 005 helpers are reused, never altered.
-- ============================================================

-- Additive helper mirroring get_user_chapter (005). Reads the caller's own
-- role bypassing RLS. Does NOT modify is_admin/is_chapter_director/get_user_chapter.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Replace the self-update policy. USING limits the row to the caller's own;
-- WITH CHECK additionally pins role and chapter to their pre-edit values.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_user_role()
    AND chapter IS NOT DISTINCT FROM public.get_user_chapter()
  );
```

- [ ] **Step 2: Apply the migration.** Apply via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `025_profiles_self_edit_lock`) with the SQL from Step 1.

- [ ] **Step 3: Verify the self-promotion-blocked check (Go/No-Go).** As a logged-in **member**, attempt to escalate own role via the anon client. In the browser devtools console while authenticated as a member, run:

```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', (await supabase.auth.getUser()).data.user.id)
```

Expected: the update returns `data: []` / an RLS-violation (the row is not updated). Then confirm in the DB via `execute_sql`:

```sql
SELECT role FROM profiles WHERE lower(email) = lower('<that member email>');
```

Expected: still `member` — self-promotion blocked.

- [ ] **Step 4: Verify a member can still edit allowed fields.** As the same member, run in devtools:

```js
await supabase.from('profiles').update({ full_name: 'New Name' }).eq('id', (await supabase.auth.getUser()).data.user.id)
```

Expected: success (no error). Then verify admin role management still works via `execute_sql` impersonation is not needed — confirm the admin policy is intact:

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname;
```

Expected list includes `Admins can manage all profiles`, `Profiles are viewable by authenticated users`, and `Users can update own profile` (the replaced one). Also confirm helpers untouched:

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter','get_user_role')
ORDER BY proname;
```

Expected: all four present (the three originals + the new `get_user_role`).

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add supabase/migrations/025_profiles_self_edit_lock.sql
git commit -m "feat(db): 025 profiles self-edit lock pins role+chapter (Phase 1 §5.4)"
```

---

## Task 8 — Migration `026_qr_tokens_director_read.sql` (additive director QR read)

`qr_tokens` today has only `qr_tokens_admin_read` (`011:24-26`), so directors get **zero** rows from `useQrTokens` despite its client filter (`useQrTokens.ts:51-53`). Add `qr_tokens_director_read` matching that filter. RLS is OR-combined, so this only **adds** rows; the admin policy is untouched.

**Files:**
- Create: `supabase/migrations/026_qr_tokens_director_read.sql`

**Steps:**

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/026_qr_tokens_director_read.sql` with the FULL contents:

```sql
-- ============================================================
-- Migration 026: Director QR-token read (Phase 1 §5.5)
--
-- qr_tokens previously had only an admin SELECT policy, so directors saw
-- ZERO rows even though useQrTokens filters to their chapter + null-chapter.
-- This policy is OR-combined with the admin one, so it only ADDS rows; it
-- never narrows admin visibility. Uses the 005 helpers (no inline profiles
-- self-select, so no recursion).
-- ============================================================

DROP POLICY IF EXISTS "qr_tokens_director_read" ON qr_tokens;
CREATE POLICY "qr_tokens_director_read" ON qr_tokens
  FOR SELECT TO authenticated
  USING (
    public.is_chapter_director()
    AND (chapter = public.get_user_chapter() OR chapter IS NULL)
  );
```

- [ ] **Step 2: Apply the migration.** Apply via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `026_qr_tokens_director_read`) with the SQL from Step 1.

- [ ] **Step 3: Verify both policies coexist (additive, not narrowing).** Run via `execute_sql`:

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'qr_tokens'
ORDER BY policyname;
```

Expected: both `qr_tokens_admin_read` and `qr_tokens_director_read` present, both `cmd = SELECT`.

- [ ] **Step 4: Smoke-verify a director now sees their chapter's tokens.** As a chapter_director, load the QR tokens tab (or run `useQrTokens`' query manually). Confirm via `execute_sql` that there exist qr_tokens whose `chapter` matches a director's chapter or is NULL:

```sql
SELECT chapter, count(*) FROM qr_tokens GROUP BY chapter ORDER BY chapter NULLS FIRST;
```

Expected: a non-zero count for at least one director chapter or for `NULL`, confirming the director will now receive rows where previously they received zero. (If all counts are zero because no tokens exist yet, mint one via the existing admin QR flow first, then re-check.)

- [ ] **Step 5: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add supabase/migrations/026_qr_tokens_director_read.sql
git commit -m "feat(db): 026 qr_tokens director read, additive (Phase 1 §5.5)"
```

---

## Task 9 — `from('members')` reader audit (HARD GATE for STEP C)

STEP C (migration `027`) drops the blanket `members` `USING(true)` SELECT and replaces it with `members_select_self_and_staff`. After that, a plain member reading `from('members')` directly would get only their own row plus staff-visible rows. Therefore **every** direct `from('members')` reader must already be (a) staff-gated (only runs for admin/director) or (b) moved to the `member_directory`/owner path. This task enumerates and classifies every call site; STEP C ships only if all are green.

**Files:**
- Read-only audit (no code changes in this task): `src/hooks/{useMembers,useMyMember,useChapterRoster,useSeatMap,useMemberTaxonomyAdmin,useIntakeGuests,useQrTokens}.ts`, `src/components/tabs/MembersTab.tsx`, `src/app/api/me/roster-visibility/route.ts`, `src/app/api/me/field-visibility/route.ts`, and any other matches.

**Steps:**

- [ ] **Step 1: Enumerate all `from('members')` call sites.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
grep -rn "from('members')\|from(\"members\")\|\.from(\`members\`)" src/ | sort
```

Record the complete list. Expected matches (as of this plan; re-run to confirm none were added):
- `src/hooks/useMembers.ts` — **now reads `member_directory`** after Task 4 (no longer `from('members')` for the list read; the realtime channel still subscribes to table `members`, which is unaffected by SELECT policy). **GREEN.**
- `src/hooks/useChapterRoster.ts:51` — runs only when `canManage` (admin/director) and a chapter is set. **Staff-gated → GREEN.**
- `src/hooks/useSeatMap.ts:50` — runs only when `canManage`. **Staff-gated → GREEN.**
- `src/hooks/useMemberTaxonomyAdmin.ts:41` — runs only when `isAdmin`. **Staff-gated → GREEN.**
- `src/hooks/useMyMember.ts:46` — reads the caller's OWN member by `ilike('email', ownEmail)`. Under the new policy, `lower(email)=current_user_email()` returns the owner's own row. **Owner path → GREEN.**
- `src/hooks/useQrTokens.ts:73` — batch name lookup `select('id,name').in('id', memberIds)`, runs only when `canManage`. **Staff-gated → GREEN.**
- `src/hooks/useIntakeGuests.ts:84` — batch name lookup, runs only when `isAdmin || isDirector`. **Staff-gated → GREEN.**
- `src/app/api/me/roster-visibility/route.ts:44` and `src/app/api/me/field-visibility/route.ts` — service-role server clients (bypass RLS). **Service role → GREEN.**
- `src/app/api/admin/member-field-visibility/route.ts` — service role. **GREEN.**

- [ ] **Step 2: Classify each match against the gate.** For every site from Step 1, assert it is exactly one of: (G1) reads `member_directory` not `members`; (G2) only executes for `isAdmin || isDirector`/`canManage`; (G3) owner self-read by `email`; (G4) service-role server route. Any site that is none of these is a **RED** blocker — it must be migrated to the directory/owner path before STEP C. Write the classification inline in the PR description (do not create a separate file).

- [ ] **Step 3: Confirm no member-visible UI reads raw `members` for the network list.** Verify `MembersTab.tsx` consumes `useMembers` (now directory-backed) and does not itself call `from('members')`. Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
grep -n "from('members')\|useMembers(" src/components/tabs/MembersTab.tsx
```

Expected: only `useMembers(` (no direct `from('members')`). `MembersTab`'s `lookupProfile`/`handleRoleSave` touch `profiles`, not `members`, and are admin-only UI — note that `profiles` SELECT remains `USING(true)` (unchanged by this workstream).

- [ ] **Step 4: Record the GATE decision.** The gate is GREEN only if **every** Step 1 site is classified G1–G4 in Step 2 with zero RED. If any RED remains, **STOP — do not proceed to Task 10.** Capture the final list and the explicit "GATE: GREEN — N call sites, all G1–G4" statement in the PR body for Task 10.

- [ ] **Step 5: Commit the audit note.** There is no code change; commit an empty marker so the gate decision is traceable. Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git commit --allow-empty -m "chore(audit): from('members') reader audit GREEN — gate for 027 STEP C (Phase 1 §5.3)"
```

---

## Task 10 — Migration `027_members_select_tighten.sql` (GATED STEP C)

**PRECONDITION (do not start otherwise):** Task 9's gate is GREEN (all `from('members')` readers are staff-gated, owner-path, directory-backed, or service-role) **and** Task 3 Step 3 / Task 4 Step 7 confirmed `member_directory` returns the same non-zero row count as `members`. Only then drop the blanket `members` SELECT and add `members_select_self_and_staff`. This narrows raw-table reads to self+staff; the network browse continues to flow through `member_directory` (which preserves row count).

**Files:**
- Create: `supabase/migrations/027_members_select_tighten.sql`

**Steps:**

- [ ] **Step 1: Re-confirm the gate immediately before applying.** Re-run the audit enumeration and the row-count invariant:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
grep -rn "from('members')\|from(\"members\")" src/ | sort
```

Expected: identical to Task 9 Step 1 (no new un-audited call site). Then via `execute_sql`:

```sql
SELECT (SELECT count(*) FROM public.members) = (SELECT count(*) FROM public.member_directory) AS counts_match;
```

Expected: `counts_match = true`. If either check fails, **STOP**.

- [ ] **Step 2: Write the migration.** Create `supabase/migrations/027_members_select_tighten.sql` with the FULL contents:

```sql
-- ============================================================
-- Migration 027: Tighten members SELECT (Phase 1 §5.3 STEP C) — GATED
--
-- PRECONDITION: the from('members') reader audit is GREEN (every direct reader
-- is staff-gated, owner self-read, service-role, or routed through
-- member_directory). The network-browse list reads member_directory (same row
-- count) so this does NOT trigger the static fallback for any member.
--
-- Drops the blanket USING(true) SELECT and replaces it with self+staff.
-- Uses the 005 helpers + current_user_email() (024); no inline profiles
-- subquery, so no recursion. Admin/director write policies are UNTOUCHED.
-- ============================================================

-- The original blanket read policy from migration 001.
DROP POLICY IF EXISTS "Members are viewable by authenticated users" ON members;

CREATE POLICY "members_select_self_and_staff"
  ON members FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_chapter_director()
    OR lower(email) = public.current_user_email()
  );
```

- [ ] **Step 3: Apply the migration.** Apply via the Supabase MCP `apply_migration` (project `ksmtkisknnvrjdfigsll`, name `027_members_select_tighten`) with the SQL from Step 1.

- [ ] **Step 4: Verify the directory STILL returns the full row count after tightening (the decisive anti-fabrication check).** Run via `execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM public.members)          AS members_count,
  (SELECT count(*) FROM public.member_directory) AS directory_count;
```

Expected: `directory_count = members_count` and **both unchanged from the pre-027 snapshot**. The `directory_members()` function is `SECURITY DEFINER`, so it still reads every row even though the base-table SELECT policy is now self+staff. If `directory_count` dropped, the directory is no longer SECURITY DEFINER-safe — **roll back 027 immediately** (re-create the blanket policy) and re-investigate; a member seeing fewer rows risks the static fallback.

- [ ] **Step 5: Verify the fingerprint check per role (Go/No-Go check 5).** Using the DB-only fingerprint member seeded in Phase 0 (a member present in the DB but absent from `src/data/members.ts`), confirm each role sees it via the directory, and a plain member sees the correct columns. As **member**, in devtools:

```js
const { data } = await supabase.from('member_directory').select('name,company,mobile_phone,address,birthday').eq('name', '<FINGERPRINT NAME>');
console.log(data);
```

Expected: exactly one row; `name`/`company` populated (business always visible); `mobile_phone`/`address`/`birthday` are `null` unless that fingerprint opted them in. As **admin**, the same query returns the personal columns populated. Confirm the member who is the fingerprint's owner (matching login email) also sees their own personal columns. **If a member sees zero rows or the static seed instead, this is an automatic No-Go — roll back 027.**

- [ ] **Step 6: Verify a member can read their OWN raw members row (owner path).** As the owner member, in devtools:

```js
await supabase.from('members').select('id,name,email').ilike('email', (await supabase.auth.getUser()).data.user.email)
```

Expected: exactly their own row (confirms `useMyMember`'s owner path still resolves under the tightened policy).

- [ ] **Step 7: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add supabase/migrations/027_members_select_tighten.sql
git commit -m "feat(db): 027 STEP C tighten members SELECT to self+staff, gated (Phase 1 §5.3)"
```

---

## Task 11 — Surface per-field visibility controls in My Profile

Give members a UI to set their own `show_mobile_phone`/`show_address`/`show_birthday` flags via the self-service API from Task 5, mirroring the existing roster-visibility toggle pattern in `MyProfileTab.tsx`.

**Files:**
- Create: `src/hooks/useMyFieldVisibility.ts`
- Modify: `src/components/tabs/MyProfileTab.tsx` (add a new section after the "Public roster visibility" `<section>` that ends at L153)

**Steps:**

- [ ] **Step 1: Write the hook.** Create `src/hooks/useMyFieldVisibility.ts` with the FULL contents:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface MyFieldVisibility {
  show_mobile_phone: boolean;
  show_address: boolean;
  show_birthday: boolean;
}

const ALL_HIDDEN: MyFieldVisibility = {
  show_mobile_phone: false,
  show_address: false,
  show_birthday: false,
};

/**
 * Reads and writes the caller's own member_field_visibility flags.
 * Read goes through member_directory ownership semantics (the owner sees their
 * own member id); write goes through the service-role /api/me/field-visibility.
 */
export function useMyFieldVisibility() {
  const { profile, session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [flags, setFlags] = useState<MyFieldVisibility>(ALL_HIDDEN);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session || !profile?.email) {
      setMemberId(null);
      setFlags(ALL_HIDDEN);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const email = profile.email.toLowerCase();
      const { data: memRows, error: mErr } = await supabase
        .from('members')
        .select('id')
        .ilike('email', email)
        .limit(1);
      if (mErr) {
        setError(mErr.message);
        setMemberId(null);
        return;
      }
      const mid = (memRows ?? [])[0]?.id as string | undefined;
      if (!mid) {
        setMemberId(null);
        setFlags(ALL_HIDDEN);
        return;
      }
      setMemberId(mid);
      const { data: vis } = await supabase
        .from('member_field_visibility')
        .select('show_mobile_phone,show_address,show_birthday')
        .eq('member_id', mid)
        .maybeSingle();
      setFlags(vis ? (vis as MyFieldVisibility) : ALL_HIDDEN);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, profile?.email]);

  useEffect(() => { load(); }, [load]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const setMyFlags = useCallback(async (next: MyFieldVisibility) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/me/field-visibility', {
      method: 'POST',
      headers,
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `update_failed_${res.status}`);
    }
    setFlags(next);
  }, [authHeaders]);

  return { flags, memberId, loading, error, refresh: load, setMyFlags };
}
```

- [ ] **Step 2: Import the hook in MyProfileTab.** In `src/components/tabs/MyProfileTab.tsx`, add after the existing `import { useMyMember } from '@/hooks/useMyMember';` (L5):

```ts
import { useMyFieldVisibility } from '@/hooks/useMyFieldVisibility';
```

- [ ] **Step 3: Wire the hook + a toggle handler.** In `MyProfileTab.tsx`, after the existing destructure `const { member, visibilities, loading, error, setMyVisibility, refresh } = useMyMember();` (L12), add:

```ts
  const { flags, setMyFlags } = useMyFieldVisibility();
  const [fieldBusy, setFieldBusy] = useState<string | null>(null);

  async function toggleField(field: 'show_mobile_phone' | 'show_address' | 'show_birthday', next: boolean) {
    setFieldBusy(field);
    setActionError(null);
    try {
      await setMyFlags({ ...flags, [field]: next });
      toast.success(next ? 'Field is now visible to other members' : 'Field is now hidden from other members');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      toast.error(`Update failed: ${msg}`);
    } finally {
      setFieldBusy(null);
    }
  }
```

- [ ] **Step 4: Add the UI section.** In `MyProfileTab.tsx`, immediately after the closing `</section>` of the "Public roster visibility" block (the `</section>` on L153, just before the final `</div>` on L154), insert:

```tsx
      <section className="rounded border bg-white p-4 space-y-3">
        <div>
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Personal info visibility</h3>
          <p className="text-xs text-gray-600 mt-1">
            Your mobile phone, home address, and birthday are hidden from other members by default.
            Turn on any field to share it in the member directory. Your business email and phone are always shown.
          </p>
        </div>
        {([
          { key: 'show_mobile_phone', label: 'Mobile phone' },
          { key: 'show_address', label: 'Home address' },
          { key: 'show_birthday', label: 'Birthday' },
        ] as const).map((f) => {
          const on = flags[f.key];
          return (
            <div key={f.key} className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-gray-500">
                  {on ? 'Visible to other logged-in members.' : 'Hidden from other members (directors/admins can still see it).'}
                </div>
              </div>
              <button
                type="button"
                disabled={fieldBusy === f.key}
                onClick={() => toggleField(f.key, !on)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                  on
                    ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'border-gray-300 text-gray-700 bg-gray-50 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                {on ? <><Eye size={14} /> Shared</> : <><EyeOff size={14} /> Hidden</>}
              </button>
            </div>
          );
        })}
      </section>
```

(`Eye`/`EyeOff` are already imported at L4 of `MyProfileTab.tsx`.)

- [ ] **Step 5: Typecheck.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
npx tsc --noEmit
```

Expected: no errors referencing `MyProfileTab.tsx` or `useMyFieldVisibility.ts`.

- [ ] **Step 6: Manual smoke test.** With `npm run dev` running, log in as a member, open My Profile, toggle "Mobile phone" to Shared, then confirm via `execute_sql`:

```sql
SELECT show_mobile_phone FROM member_field_visibility
WHERE member_id = (SELECT id FROM members WHERE lower(email) = lower('<member email>') LIMIT 1);
```

Expected: `true`. Then, as a **different** plain member, open the member directory / `MembersTab` and confirm that member's mobile phone now appears (and a non-opted-in member's mobile does not).

- [ ] **Step 7: Commit.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add src/hooks/useMyFieldVisibility.ts src/components/tabs/MyProfileTab.tsx
git commit -m "feat(profile): per-field personal-PII visibility toggles (Phase 1 §5.6)"
```

---

## Task 12 — Full regression + Go/No-Go sweep for this workstream

Run the whole suite and the spec §8 checks relevant to additive RLS/access.

**Files:** none (verification only).

**Steps:**

- [ ] **Step 1: Run the full test suite.** Run:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
npm test
```

Expected: all suites pass, including the new `field-visibility.test.ts` (7) and `directory.test.ts` (4); no regressions in `members/summary.test.ts`.

- [ ] **Step 2: Helpers-untouched check (Go/No-Go check 10).** Run via `execute_sql`:

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args,
       prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter')
ORDER BY proname;
```

Expected: three rows, each with **no arguments** and `security_definer = true` — byte-identical signatures to migration `005`. Confirm no new policy inlines a `profiles` self-select:

```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE tablename IN ('members','profiles','qr_tokens','member_field_visibility')
  AND qual ILIKE '%FROM profiles%';
```

Expected: **zero rows** (every new policy calls `is_admin()`/`is_chapter_director()`/`get_user_role()`/`current_user_email()`, never an inline `SELECT ... FROM profiles`).

- [ ] **Step 3: Counts-unchanged check (Go/No-Go check 8).** Compare against the Phase 0 baseline snapshot via `execute_sql`:

```sql
SELECT
  count(*) FILTER (WHERE member_type = 'full')        AS full_members,
  count(*) FILTER (WHERE member_type = 'after_hours') AS after_hours,
  count(*) FILTER (WHERE member_type = 'full' AND chapter = 'North')  AS north,
  count(*) FILTER (WHERE member_type = 'full' AND chapter = 'South')  AS south,
  count(*) FILTER (WHERE member_type = 'full' AND chapter = 'Uptown') AS uptown,
  count(*) FILTER (WHERE member_type = 'full' AND chapter = 'FLOC')   AS floc,
  count(*) FILTER (WHERE member_type = 'full' AND chapter = 'Alumni') AS alumni
FROM members;
```

Expected: identical to the Phase-0 snapshot (this workstream adds no rows and hides none; row count never changed).

- [ ] **Step 4: Anti-fabrication fingerprint sweep (Go/No-Go check 5).** Re-run Task 10 Step 5 for all three roles (admin, chapter_director, member). Expected: each role sees the DB-only fingerprint member through `member_directory`; the member sees business fields always and personal fields only when opted-in/owned; **no role ever sees the static `src/data/members.ts` list**. Any role seeing zero rows or the static list = No-Go.

- [ ] **Step 5: Public/anon path untouched (Go/No-Go check 7).** Logged out (anon), confirm the public roster preview still works and the new directory is NOT anon-readable. Run via `execute_sql` as a sanity check on grants:

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'member_directory';
```

Expected: `authenticated` has `SELECT`; `anon` does **not** appear. Separately confirm `cmv_public_read_visible` still returns rows for anon (unchanged by this workstream).

- [ ] **Step 6: Final commit (if any audit artifacts changed).** If Steps produced no file changes, skip. Otherwise:

```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard"
git add -A
git commit -m "test(phase1-rls): Go/No-Go sweep for additive RLS & access control"
```

---

## Done when

This workstream is complete when, against prod-equivalent data:

1. **Same row count, no fabrication (spec §8 check 5 / risk #1).** `member_directory` returns the exact `members` row count both before and after `027`; each of the three roles sees the DB-only fingerprint member through the directory, and no role ever sees the static `src/data/members.ts` seed. (Tasks 3.3, 4.7, 10.4, 10.5, 12.4.)
2. **Personal PII is opt-in; mobile is personal (spec §5.1/§5.2, decision §10.1).** `mobile_phone`, `address`, `birthday` are NULL for non-owner non-staff viewers unless opted in via `member_field_visibility`; business email/phone stay always-visible. (Tasks 1, 2, 3, 5, 11.)
3. **Members cannot self-promote (spec §5.4 / §8 check 4-spirit).** A member's attempt to set `role`/`chapter` on their own profile is rejected by the `025` `WITH CHECK`; `full_name`/`must_change_password` edits still succeed; the admin "manage all profiles" policy is intact. (Task 7.3-7.4.)
4. **Directors can read their chapter's QR tokens (spec §5.5).** `qr_tokens_director_read` is OR-combined with the admin policy; a director who previously got zero rows now receives their chapter's + null-chapter tokens; admin visibility is unchanged. (Task 8.)
5. **Staged cutover honored (spec §5.3, risk #7).** STEP A left the blanket policy; STEP B repointed `useMembers` at `member_directory` in the same release as `024`; STEP C (`027`) shipped **only** after the `from('members')` reader audit (Task 9) was GREEN — every reader is staff-gated, owner-path, directory-backed, or service-role. (Tasks 4, 9, 10.)
6. **Spine untouched (spec §1.3 / §8 check 10 / risk #5).** `is_admin()`/`is_chapter_director()`/`get_user_chapter()` signatures are byte-identical to `005`; no new policy inlines a `profiles` self-select; `handle_new_user` and `AuthGuard` were never touched. (Task 12.2.)
7. **Additive write surfaces only.** Field-visibility writes flow through the member self-service route and the chapter-scoped admin route (both service-role); `member_field_visibility` has no anon and no authenticated write policy. (Tasks 5, 6, 2.3.)
8. **Counts and public/anon paths unchanged (spec §8 checks 7-8).** Per-chapter and full/after-hours counts match the Phase-0 snapshot; `member_directory` is not anon-readable; `cmv_public_read_visible` still serves anon. (Task 12.3, 12.5.)
