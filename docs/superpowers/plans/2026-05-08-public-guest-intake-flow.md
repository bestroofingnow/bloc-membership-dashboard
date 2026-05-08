# Public Guest Intake Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the public-facing QR-driven guest intake flow defined in `docs/superpowers/specs/2026-05-08-public-guest-intake-flow-design.md`.

**Architecture:** Server-driven multi-route Next.js wizard at `/guest/i/[token]/...` with one client island for the live conflict-check form. Pure conflict-engine module (`src/lib/guest/conflict.ts`) drives soft-warn behavior. Anonymous guest identity with magic-link return path. GHL contact upsert and confirmation email run as non-blocking post-commit side effects.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind, vitest (new), zod (new), Resend for email (new — swappable behind interface), GoHighLevel API.

## Spec → implementation name mapping

The spec uses conceptual names. Implementation maps them to non-colliding tables:

| Spec name | Implementation table | Reason |
|---|---|---|
| `guests` | **`intake_guests`** | Existing `guests` table powers kanban pipeline |
| `guest_rsvps` | **`intake_rsvps`** | Consistency with intake prefix |
| `guest_sessions` | **`intake_sessions`** | Consistency |
| `conflict_log` | **`intake_conflict_log`** | Consistency |
| `side_effect_failures` | **`intake_side_effect_failures`** | Consistency |
| `industries` | **`industry_categories`** (existing) | Reuse existing Targets taxonomy top level |
| `categories` | **`industry_targets`** (existing) | Reuse existing Targets taxonomy second level |
| `events`, `qr_tokens`, `chapter_member_visibility` | unchanged | No collision |

`industry_categories` and `industry_targets` already exist with the right two-level shape. The recruitment-specific columns on `industry_targets` (`priority`, `assigned_to`) coexist with their use as the public-flow category vocabulary — same row, different consumers.

---

## Phase 0 — Test framework and dependencies

### Task 0.1: Install dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install zod jose
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add test scripts to package.json**

Edit `package.json` `"scripts"` section to add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 4: Verify install**

Run: `npm run test -- --version`
Expected: vitest version printed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest, zod, ics, jose for guest intake flow"
```

### Task 0.2: Configure vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 2: Create test setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Smoke-test vitest**

Create `src/test/smoke.test.ts`:

```ts
import { describe, test, expect } from 'vitest';

describe('vitest smoke', () => {
  test('it works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 4: Delete the smoke test**

```bash
rm src/test/smoke.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts
git commit -m "chore: configure vitest"
```

---

## Phase 1 — Database migrations

These migrations land schema only. Data seeding happens after the conflict engine is in place so we can verify it against real members.

### Task 1.1: Migration 009 — alter members for taxonomy FKs

**Files:**
- Create: `supabase/migrations/009_intake_member_taxonomy.sql`

- [ ] **Step 1: Inspect current members columns**

Run via Supabase MCP `list_tables` (schema: `public`) and confirm `members` table has no `industry_id` or `category_id` columns. If it does, adjust the migration accordingly.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/009_intake_member_taxonomy.sql`:

```sql
-- 009_intake_member_taxonomy.sql
-- Add taxonomy FKs to members so the conflict engine can resolve
-- "what industry+category does each member hold in their chapter?"

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS members_industry_id_idx ON members(industry_id);
CREATE INDEX IF NOT EXISTS members_category_id_idx ON members(category_id);
CREATE INDEX IF NOT EXISTS members_chapter_industry_category_idx
  ON members(chapter, industry_id, category_id);
```

- [ ] **Step 3: Apply via MCP**

Use Supabase MCP `apply_migration` with name `009_intake_member_taxonomy` and the SQL above.

- [ ] **Step 4: Verify**

Run via MCP `execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'members' AND column_name IN ('industry_id','category_id');
```

Expected: 2 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_intake_member_taxonomy.sql
git commit -m "feat(db): add taxonomy FKs to members"
```

### Task 1.2: Migration 010 — events table

**Files:**
- Create: `supabase/migrations/010_intake_events.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/010_intake_events.sql`:

```sql
-- 010_intake_events.sql
-- Public-visible events that the guest flow's event picker reads from.

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter TEXT CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),  -- NULL = cross-chapter
  kind TEXT NOT NULL CHECK (kind IN ('lunch','after_hours','special')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  location_name TEXT,
  location_address TEXT,
  ics_uid TEXT UNIQUE NOT NULL,
  public_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX events_starts_at_idx ON events(starts_at);
CREATE INDEX events_chapter_idx ON events(chapter);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Anon can read public_visible upcoming events
CREATE POLICY "events_public_read" ON events
  FOR SELECT TO anon
  USING (public_visible = TRUE);

-- Authenticated users can read everything
CREATE POLICY "events_auth_read" ON events
  FOR SELECT TO authenticated USING (TRUE);

-- Only admin can write
CREATE POLICY "events_admin_write" ON events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

- [ ] **Step 2: Apply via MCP**

Use `apply_migration` with name `010_intake_events`.

- [ ] **Step 3: Verify**

Via MCP `execute_sql`:

```sql
SELECT COUNT(*) FROM events;
```

Expected: 0 rows, no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_intake_events.sql
git commit -m "feat(db): add events table for public guest flow"
```

### Task 1.3: Migration 011 — qr_tokens and intake_sessions

**Files:**
- Create: `supabase/migrations/011_intake_qr_sessions.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/011_intake_qr_sessions.sql`:

```sql
-- 011_intake_qr_sessions.sql
-- Signed-token registry for QR codes, plus short-lived wizard sessions.

CREATE TABLE IF NOT EXISTS qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general','chapter','event','member_invite','after_hours')),
  chapter TEXT CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  invited_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  label TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scan_count INT NOT NULL DEFAULT 0,
  last_scanned_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX qr_tokens_token_idx ON qr_tokens(token);
CREATE INDEX qr_tokens_chapter_idx ON qr_tokens(chapter);

ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;

-- No public read. Server-side route uses service role.
CREATE POLICY "qr_tokens_admin_read" ON qr_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,
  partial_payload JSONB NOT NULL DEFAULT '{}',
  current_step TEXT NOT NULL CHECK (current_step IN ('landing','event','chapter','details')),
  ip_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX intake_sessions_expires_at_idx ON intake_sessions(expires_at);
CREATE INDEX intake_sessions_token_idx ON intake_sessions(token);

ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;
-- No anon access; route handlers use service role.
```

- [ ] **Step 2: Apply via MCP**

`apply_migration` with name `011_intake_qr_sessions`.

- [ ] **Step 3: Verify**

```sql
SELECT COUNT(*) FROM qr_tokens;
SELECT COUNT(*) FROM intake_sessions;
```

Expected: 0, 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_intake_qr_sessions.sql
git commit -m "feat(db): add qr_tokens and intake_sessions"
```

### Task 1.4: Migration 012 — intake_guests, intake_rsvps, conflict_log, side_effect_failures

**Files:**
- Create: `supabase/migrations/012_intake_rsvps.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/012_intake_rsvps.sql`:

```sql
-- 012_intake_rsvps.sql
-- Guest leads from the public flow, their RSVPs, conflict audit, side-effect failures.

CREATE TABLE IF NOT EXISTS intake_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  other_category_text TEXT,
  ghl_contact_id TEXT,
  magic_token_hash TEXT,
  magic_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX intake_guests_email_normalized_idx ON intake_guests(email_normalized);
CREATE INDEX intake_guests_magic_token_hash_idx ON intake_guests(magic_token_hash) WHERE magic_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS intake_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES intake_guests(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  qr_token_id UUID REFERENCES qr_tokens(id) ON DELETE SET NULL,
  invited_by_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  conflict_kind TEXT NOT NULL CHECK (conflict_kind IN ('none','exact','related','other')),
  conflict_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','attended','no_show','canceled')),
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (guest_id, event_id)
);

CREATE INDEX intake_rsvps_event_id_idx ON intake_rsvps(event_id);
CREATE INDEX intake_rsvps_status_idx ON intake_rsvps(status);

CREATE TABLE IF NOT EXISTS intake_conflict_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL REFERENCES intake_rsvps(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL,
  industry_id UUID REFERENCES industry_categories(id) ON DELETE SET NULL,
  category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  conflict_kind TEXT NOT NULL,
  occupants_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_side_effect_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID NOT NULL REFERENCES intake_rsvps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ghl','email')),
  error_code TEXT,
  error_msg TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX intake_side_effect_failures_unresolved_idx
  ON intake_side_effect_failures(rsvp_id) WHERE resolved_at IS NULL;

-- All four tables: server-only writes (service role); admin/chapter-director read.
ALTER TABLE intake_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_conflict_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_side_effect_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_guests_admin_read" ON intake_guests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_rsvps_admin_read" ON intake_rsvps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_conflict_log_admin_read" ON intake_conflict_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));

CREATE POLICY "intake_side_effect_failures_admin_read" ON intake_side_effect_failures
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','chapter_director')));
```

- [ ] **Step 2: Apply via MCP**

`apply_migration` with name `012_intake_rsvps`.

- [ ] **Step 3: Verify**

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('intake_guests','intake_rsvps','intake_conflict_log','intake_side_effect_failures');
```

Expected: 4 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_intake_rsvps.sql
git commit -m "feat(db): add intake_guests/rsvps/conflict_log/side_effect_failures"
```

### Task 1.5: Migration 013 — chapter_member_visibility

**Files:**
- Create: `supabase/migrations/013_chapter_member_visibility.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/013_chapter_member_visibility.sql`:

```sql
-- 013_chapter_member_visibility.sql
-- Per-chapter opt-in for the public roster preview. Default visible.

CREATE TABLE IF NOT EXISTS chapter_member_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL CHECK (chapter IN ('North','South','Uptown','FLOC','Alumni')),
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  public_business_name TEXT,
  public_category_id UUID REFERENCES industry_targets(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, chapter)
);

CREATE INDEX chapter_member_visibility_chapter_visible_idx
  ON chapter_member_visibility(chapter) WHERE visible = TRUE;

ALTER TABLE chapter_member_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmv_public_read_visible" ON chapter_member_visibility
  FOR SELECT TO anon
  USING (visible = TRUE);

CREATE POLICY "cmv_auth_read" ON chapter_member_visibility
  FOR SELECT TO authenticated USING (TRUE);
```

- [ ] **Step 2: Apply via MCP**

`apply_migration` with name `013_chapter_member_visibility`.

- [ ] **Step 3: Verify**

```sql
SELECT COUNT(*) FROM chapter_member_visibility;
```

Expected: 0 rows, no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_chapter_member_visibility.sql
git commit -m "feat(db): add chapter_member_visibility"
```

---

## Phase 2 — Pure libraries (TDD)

### Task 2.1: Type definitions for the guest module

**Files:**
- Create: `src/lib/guest/types.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/guest/types.ts`:

```ts
export type ChapterCode = 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni';

export type QrTokenKind = 'general' | 'chapter' | 'event' | 'member_invite' | 'after_hours';

export interface QrTokenPayload {
  kind: QrTokenKind;
  chapter?: ChapterCode;
  event_id?: string;
  invited_by_member_id?: string;
  qr_id: string;
  iat: number; // issued-at unix seconds
}

export interface MemberForConflict {
  id: string;
  chapter: ChapterCode;
  industry_id: string | null;
  category_id: string | null;
  full_name: string;
  business_name: string;
}

export type ConflictKind = 'none' | 'exact' | 'related' | 'other';

export interface ConflictResult {
  kind: ConflictKind;
  occupants: MemberForConflict[];
}

export interface ConflictInput {
  chapter: ChapterCode;
  industry_id: string | null;
  category_id: string | null;
  members_in_chapter: MemberForConflict[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guest/types.ts
git commit -m "feat(guest): add core type definitions"
```

### Task 2.2: Conflict engine — failing tests

**Files:**
- Create: `src/lib/guest/conflict.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/guest/conflict.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { conflict } from './conflict';
import type { MemberForConflict } from './types';

const member = (overrides: Partial<MemberForConflict> = {}): MemberForConflict => ({
  id: 'm1',
  chapter: 'Uptown',
  industry_id: 'ind-real-estate',
  category_id: 'cat-residential-agent',
  full_name: 'Alice Member',
  business_name: 'Acme Realty',
  ...overrides,
});

describe('conflict()', () => {
  test('empty chapter → kind: none', () => {
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [],
    });
    expect(res.kind).toBe('none');
    expect(res.occupants).toEqual([]);
  });

  test('member with same category → kind: exact', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
    expect(res.occupants).toEqual([m]);
  });

  test('member with same industry, different category → kind: related', () => {
    const m = member({ category_id: 'cat-commercial-agent' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('related');
    expect(res.occupants).toEqual([m]);
  });

  test('member with different industry → kind: none', () => {
    const m = member({
      industry_id: 'ind-home-services',
      category_id: 'cat-plumbing',
    });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('none');
    expect(res.occupants).toEqual([]);
  });

  test('multiple occupants in same category → all returned', () => {
    const m1 = member({ id: 'm1' });
    const m2 = member({ id: 'm2', full_name: 'Bob Member' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m1, m2],
    });
    expect(res.kind).toBe('exact');
    expect(res.occupants).toHaveLength(2);
    expect(res.occupants.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  test('guest picked Other (no category_id) → kind: other', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: null,
      category_id: null,
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('other');
    expect(res.occupants).toEqual([]);
  });

  test('guest with industry but no category → kind: other (incomplete)', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: null,
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('other');
  });

  test('member in different chapter is filtered by caller; conflict() trusts input', () => {
    // Caller is responsible for passing only same-chapter members. Verify behavior is consistent.
    const m = member({ chapter: 'North' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    // Since caller passed it in, conflict() treats it as in-chapter for matching purposes.
    expect(res.kind).toBe('exact');
  });

  test('member with category but no industry → still matches on category', () => {
    const m = member({ industry_id: null });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/guest/conflict.test.ts`
Expected: FAIL with "Cannot find module './conflict'" or similar.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/lib/guest/conflict.test.ts
git commit -m "test(guest): add conflict engine specs (failing)"
```

### Task 2.3: Conflict engine — implementation

**Files:**
- Create: `src/lib/guest/conflict.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/guest/conflict.ts`:

```ts
import type { ConflictInput, ConflictResult, MemberForConflict } from './types';

/**
 * Classify a guest's category pick against the chapter's existing members.
 *
 * Pure function. Caller fetches members and passes them in.
 *
 * Rules:
 * - category_id null  → 'other' (no live conflict logic; review queue handles it)
 * - any member with same category_id → 'exact'
 * - else any member with same industry_id → 'related'
 * - else → 'none'
 */
export function conflict(input: ConflictInput): ConflictResult {
  const { industry_id, category_id, members_in_chapter } = input;

  if (category_id === null) {
    return { kind: 'other', occupants: [] };
  }

  const exact = members_in_chapter.filter(
    (m: MemberForConflict) => m.category_id === category_id,
  );
  if (exact.length > 0) {
    return { kind: 'exact', occupants: exact };
  }

  if (industry_id !== null) {
    const related = members_in_chapter.filter(
      (m: MemberForConflict) => m.industry_id === industry_id,
    );
    if (related.length > 0) {
      return { kind: 'related', occupants: related };
    }
  }

  return { kind: 'none', occupants: [] };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test src/lib/guest/conflict.test.ts`
Expected: 9 passed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guest/conflict.ts
git commit -m "feat(guest): conflict engine"
```

### Task 2.4: Token signing — failing tests

**Files:**
- Create: `src/lib/guest/tokens.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/lib/guest/tokens.test.ts`:

```ts
import { describe, test, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from './tokens';
import type { QrTokenPayload } from './types';

const SECRET = 'test-secret-do-not-use-in-prod-32chars-min';

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = SECRET;
});

const samplePayload: Omit<QrTokenPayload, 'iat'> = {
  kind: 'member_invite',
  chapter: 'Uptown',
  event_id: 'event-123',
  invited_by_member_id: 'member-42',
  qr_id: 'qr-abc',
};

describe('signToken / verifyToken', () => {
  test('round-trips a valid payload', async () => {
    const t = await signToken(samplePayload);
    const decoded = await verifyToken(t);
    expect(decoded).toMatchObject(samplePayload);
    expect(typeof decoded?.iat).toBe('number');
  });

  test('verifyToken with tampered payload returns null', async () => {
    const t = await signToken(samplePayload);
    const tampered = t.slice(0, -2) + 'AA';
    const decoded = await verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  test('verifyToken with valid signature but wrong secret returns null', async () => {
    const t = await signToken(samplePayload);
    process.env.GUEST_TOKEN_SECRET = 'a-different-secret-also-32-chars-long';
    const decoded = await verifyToken(t);
    expect(decoded).toBeNull();
    process.env.GUEST_TOKEN_SECRET = SECRET;
  });

  test('verifyToken with empty string returns null', async () => {
    const decoded = await verifyToken('');
    expect(decoded).toBeNull();
  });

  test('verifyToken with garbage returns null', async () => {
    const decoded = await verifyToken('not.a.valid.token');
    expect(decoded).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/guest/tokens.test.ts`
Expected: FAIL with "Cannot find module './tokens'".

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/guest/tokens.test.ts
git commit -m "test(guest): add token signing specs (failing)"
```

### Task 2.5: Token signing — implementation

**Files:**
- Create: `src/lib/guest/tokens.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/guest/tokens.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import type { QrTokenPayload } from './types';

function getSecret(): Uint8Array {
  const raw = process.env.GUEST_TOKEN_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('GUEST_TOKEN_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(raw);
}

export async function signToken(
  payload: Omit<QrTokenPayload, 'iat'>,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<QrTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as QrTokenPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test src/lib/guest/tokens.test.ts`
Expected: 5 passed.

- [ ] **Step 3: Add `GUEST_TOKEN_SECRET` to env example**

Edit `.env.local.example` and append:

```
# 32+ char random secret used to sign QR tokens
GUEST_TOKEN_SECRET=
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/guest/tokens.ts .env.local.example
git commit -m "feat(guest): JWT-based QR token signing"
```

### Task 2.6: ICS generation — failing test

**Files:**
- Create: `src/lib/guest/ics.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/guest/ics.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs()', () => {
  test('produces a valid ICS string with stable UID', () => {
    const ics = buildIcs({
      uid: 'event-uptown-after-hours-2026-04@bloc',
      title: 'BLOC Uptown After Hours',
      description: 'April After Hours at Slate Billiards',
      location: 'Slate Billiards, Charlotte NC',
      starts_at: new Date('2026-04-29T17:30:00-04:00'),
      ends_at: new Date('2026-04-29T19:30:00-04:00'),
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('UID:event-uptown-after-hours-2026-04@bloc');
    expect(ics).toContain('SUMMARY:BLOC Uptown After Hours');
    expect(ics).toContain('LOCATION:Slate Billiards\\, Charlotte NC');
  });

  test('handles missing description and location', () => {
    const ics = buildIcs({
      uid: 'event-x@bloc',
      title: 'X',
      starts_at: new Date('2026-05-01T12:00:00-04:00'),
      ends_at: new Date('2026-05-01T13:00:00-04:00'),
    });
    expect(ics).toContain('UID:event-x@bloc');
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/guest/ics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/guest/ics.test.ts
git commit -m "test(guest): add ICS generator specs (failing)"
```

### Task 2.7: ICS generation — implementation

**Files:**
- Create: `src/lib/guest/ics.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/guest/ics.ts`:

```ts
export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  starts_at: Date;
  ends_at: Date;
}

function fmt(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLOC Membership//Guest Intake//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(event.starts_at)}`,
    `DTEND:${fmt(event.ends_at)}`,
    `SUMMARY:${escape(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test src/lib/guest/ics.test.ts`
Expected: 2 passed.

- [ ] **Step 3: Manual smoke test (one-time)**

Generate one .ics file, save it, open it in Google Calendar **and** Apple Calendar to confirm it parses cleanly. (No automated test — we trust the snapshot afterward.)

```bash
node -e "
const { buildIcs } = require('./src/lib/guest/ics.ts');
const ics = buildIcs({
  uid: 'manual-smoke@bloc',
  title: 'BLOC Smoke Test',
  starts_at: new Date(Date.now() + 86400000),
  ends_at: new Date(Date.now() + 86400000 + 3600000),
});
require('fs').writeFileSync('/tmp/smoke.ics', ics);
console.log('Wrote /tmp/smoke.ics');
"
open /tmp/smoke.ics
```

(If Node can't import .ts directly, transpile or use `tsx`. This is a one-time manual check, not in CI.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/guest/ics.ts
git commit -m "feat(guest): RFC-5545 ICS builder"
```

---

## Phase 3 — Side-effect libraries (with mocks)

### Task 3.1: GHL client interface + stub implementation

**Files:**
- Create: `src/lib/guest/ghl.ts`

- [ ] **Step 1: Write the interface and a stub impl**

Create `src/lib/guest/ghl.ts`:

```ts
export interface GhlContactInput {
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
}

export interface GhlClient {
  upsertContact(input: GhlContactInput): Promise<{ contact_id: string }>;
}

class RealGhlClient implements GhlClient {
  constructor(private apiKey: string, private locationId: string) {}

  async upsertContact(input: GhlContactInput): Promise<{ contact_id: string }> {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locationId: this.locationId,
        email: input.email,
        firstName: input.first_name,
        lastName: input.last_name,
        companyName: input.business_name,
        tags: input.tags ?? [],
        customFields: input.custom_fields ?? {},
      }),
    });
    if (!res.ok) {
      throw new Error(`GHL upsert failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return { contact_id: body.contact?.id ?? body.id };
  }
}

class MockGhlClient implements GhlClient {
  async upsertContact(input: GhlContactInput): Promise<{ contact_id: string }> {
    return { contact_id: `mock-${input.email}` };
  }
}

export function getGhlClient(): GhlClient {
  if (process.env.NODE_ENV === 'test' || !process.env.GHL_API_KEY) {
    return new MockGhlClient();
  }
  return new RealGhlClient(process.env.GHL_API_KEY!, process.env.GHL_LOCATION_ID!);
}
```

- [ ] **Step 2: Add env vars to example**

Append to `.env.local.example`:

```
# GoHighLevel — leave blank in dev for the mock client
GHL_API_KEY=
GHL_LOCATION_ID=
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/guest/ghl.ts .env.local.example
git commit -m "feat(guest): GHL client interface + mock + real impl"
```

### Task 3.2: Email client interface + Resend implementation + mock

**Files:**
- Create: `src/lib/guest/email.ts`

- [ ] **Step 1: Write the email module**

Create `src/lib/guest/email.ts`:

```ts
export interface EmailConfirmationInput {
  to: string;
  guest_first_name: string;
  event_title: string;
  event_starts_at: Date;
  event_location: string;
  ics_attachment: string; // raw .ics text
  magic_link: string;
}

export interface EmailClient {
  sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }>;
}

class ResendEmailClient implements EmailClient {
  constructor(private apiKey: string, private from: string) {}

  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    const html = `
      <p>Hi ${escapeHtml(input.guest_first_name)},</p>
      <p>You're registered for <strong>${escapeHtml(input.event_title)}</strong>.</p>
      <p>${input.event_starts_at.toLocaleString()} &middot; ${escapeHtml(input.event_location)}</p>
      <p>The calendar invite is attached. To register for another event or manage your RSVPs,
      <a href="${input.magic_link}">click here</a>.</p>
      <p>— BLOC</p>
    `;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: `You're registered for ${input.event_title}`,
        html,
        attachments: [
          {
            filename: 'event.ics',
            content: Buffer.from(input.ics_attachment).toString('base64'),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return { message_id: body.id };
  }
}

class MockEmailClient implements EmailClient {
  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    return { message_id: `mock-${input.to}` };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function getEmailClient(): EmailClient {
  if (process.env.NODE_ENV === 'test' || !process.env.RESEND_API_KEY) {
    return new MockEmailClient();
  }
  return new ResendEmailClient(
    process.env.RESEND_API_KEY!,
    process.env.RESEND_FROM_ADDRESS ?? 'no-reply@businessleadersofcharlotte.com',
  );
}
```

- [ ] **Step 2: Add env vars to example**

Append to `.env.local.example`:

```
# Resend — leave blank in dev for the mock client
RESEND_API_KEY=
RESEND_FROM_ADDRESS=no-reply@businessleadersofcharlotte.com
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/guest/email.ts .env.local.example
git commit -m "feat(guest): email client (Resend) + mock"
```

### Task 3.3: Server-side Supabase client helper

**Files:**
- Create: `src/lib/guest/supabase-server.ts`

- [ ] **Step 1: Check existing supabase setup**

Read `src/lib/supabase.ts` to see what's already exported. The existing client is anon-keyed for the browser. We need a service-role server client for the public flow's writes.

- [ ] **Step 2: Write the helper**

Create `src/lib/guest/supabase-server.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS. Never import this from a client component.
 */
export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 3: Add to env example if missing**

Confirm `.env.local.example` has `SUPABASE_SERVICE_ROLE_KEY=` (it almost certainly does already since the existing email-intake edge function uses it). If not, add it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/guest/supabase-server.ts
git commit -m "feat(guest): service-role Supabase server helper"
```

### Task 3.4: Magic-link generation helper

**Files:**
- Create: `src/lib/guest/magic.ts`
- Create: `src/lib/guest/magic.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/guest/magic.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { mintMagic, hashMagic } from './magic';

describe('magic-link helpers', () => {
  test('mintMagic returns { token, hash, expires_at }', () => {
    const m = mintMagic({ ttlDays: 30 });
    expect(typeof m.token).toBe('string');
    expect(m.token.length).toBeGreaterThanOrEqual(32);
    expect(typeof m.hash).toBe('string');
    expect(m.hash.length).toBe(64); // sha256 hex
    expect(m.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('hashMagic is deterministic', () => {
    expect(hashMagic('abc')).toBe(hashMagic('abc'));
    expect(hashMagic('abc')).not.toBe(hashMagic('xyz'));
  });

  test('mint then verify by hash matches', () => {
    const m = mintMagic({ ttlDays: 30 });
    expect(hashMagic(m.token)).toBe(m.hash);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `npm test src/lib/guest/magic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/guest/magic.ts`:

```ts
import { randomBytes, createHash } from 'crypto';

export interface MagicMint {
  token: string;
  hash: string;
  expires_at: Date;
}

export function mintMagic(opts: { ttlDays: number }): MagicMint {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashMagic(token),
    expires_at: new Date(Date.now() + opts.ttlDays * 24 * 60 * 60 * 1000),
  };
}

export function hashMagic(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `npm test src/lib/guest/magic.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guest/magic.ts src/lib/guest/magic.test.ts
git commit -m "feat(guest): magic-link mint + sha256 hash helpers"
```

### Task 3.5: Rate limit helper (Supabase-backed)

**Files:**
- Create: `supabase/migrations/014_intake_rate_limits.sql`
- Create: `src/lib/guest/rate-limit.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/014_intake_rate_limits.sql`:

```sql
-- 014_intake_rate_limits.sql
CREATE TABLE IF NOT EXISTS intake_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,    -- e.g. 'submit:1.2.3.4'
  count  INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket, window_start)
);

CREATE INDEX intake_rate_limits_bucket_window_idx
  ON intake_rate_limits(bucket, window_start);

-- No RLS needed: only service-role server access.
```

- [ ] **Step 2: Apply via MCP**

`apply_migration` with name `014_intake_rate_limits`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/guest/rate-limit.ts`:

```ts
import { getServerSupabase } from './supabase-server';

export interface RateLimitOpts {
  bucket: string;        // e.g. `submit:${ip}`
  limit: number;         // max events per window
  windowSeconds: number; // window size
}

/**
 * Atomic-ish window counter. Uses a single SQL upsert.
 * Returns true if the action is allowed (under limit), false if rate-limited.
 */
export async function rateLimit(opts: RateLimitOpts): Promise<boolean> {
  const sb = getServerSupabase();
  const windowStart = new Date(
    Math.floor(Date.now() / (opts.windowSeconds * 1000)) * opts.windowSeconds * 1000,
  );
  // Upsert + return current count
  const { data, error } = await sb.rpc('intake_rate_limit_bump', {
    p_bucket: opts.bucket,
    p_window_start: windowStart.toISOString(),
  });
  if (error) {
    // Fail-open: if rate-limit infra is broken, don't block the user.
    console.error('rate_limit error', error);
    return true;
  }
  return (data as number) <= opts.limit;
}

export function ipFromHeaders(h: Headers): string {
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    '0.0.0.0'
  );
}
```

- [ ] **Step 4: Add the matching SQL function**

Append to `supabase/migrations/014_intake_rate_limits.sql`:

```sql
CREATE OR REPLACE FUNCTION intake_rate_limit_bump(
  p_bucket TEXT,
  p_window_start TIMESTAMPTZ
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO intake_rate_limits (bucket, window_start, count)
  VALUES (p_bucket, p_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = intake_rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Opportunistic cleanup of old rows (older than 1 day)
  DELETE FROM intake_rate_limits WHERE window_start < NOW() - INTERVAL '1 day';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

Re-apply via MCP `apply_migration` (idempotent — `CREATE OR REPLACE`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/014_intake_rate_limits.sql src/lib/guest/rate-limit.ts
git commit -m "feat(guest): supabase-backed rate-limit helper"
```

---

## Phase 4 — API routes

### Task 4.1: `/api/guest/check-conflict`

**Files:**
- Create: `src/app/api/guest/check-conflict/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/guest/check-conflict/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { conflict } from '@/lib/guest/conflict';
import type { ChapterCode, MemberForConflict } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const querySchema = z.object({
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  industry_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const ok = await rateLimit({
    bucket: `check-conflict:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    chapter: url.searchParams.get('chapter'),
    industry_id: url.searchParams.get('industry_id') || null,
    category_id: url.searchParams.get('category_id') || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { chapter, industry_id, category_id } = parsed.data;
  const sb = getServerSupabase();
  const { data: members, error } = await sb
    .from('members')
    .select('id,chapter,industry_id,category_id,full_name,business_name')
    .eq('chapter', chapter);

  if (error) {
    console.error('check-conflict members fetch', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const result = conflict({
    chapter: chapter as ChapterCode,
    industry_id: industry_id ?? null,
    category_id: category_id ?? null,
    members_in_chapter: (members ?? []) as MemberForConflict[],
  });

  return NextResponse.json({
    kind: result.kind,
    occupant: result.occupants[0]
      ? {
          full_name: result.occupants[0].full_name,
          business_name: result.occupants[0].business_name,
        }
      : null,
  });
}
```

- [ ] **Step 2: Manually smoke test**

Run dev server: `npm run dev`

In another terminal:

```bash
curl "http://localhost:3000/api/guest/check-conflict?chapter=Uptown" -i
```

Expected: 200 with `{"kind":"other","occupant":null}` (because no industry/category, falls into the 'other' branch).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/guest/check-conflict/route.ts
git commit -m "feat(guest): /api/guest/check-conflict route"
```

### Task 4.2: `/api/guest/submit` — input validation skeleton

**Files:**
- Create: `src/app/api/guest/submit/route.ts`

- [ ] **Step 1: Write the route skeleton with validation only**

Create `src/app/api/guest/submit/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const submitSchema = z.object({
  token: z.string(),
  session_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  business_name: z.string().min(1).max(200),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  event_id: z.string().uuid(),
  industry_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  other_category_text: z.string().max(200).nullable(),
  invited_by_member_id: z.string().uuid().nullable(),
  qr_token_id: z.string().uuid().nullable(),
}).refine(
  (d) => (d.industry_id && d.category_id) || (!!d.other_category_text),
  { message: 'Provide industry+category OR other_category_text' },
);

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const okMin = await rateLimit({ bucket: `submit:min:${ip}`, limit: 5, windowSeconds: 60 });
  const okHr = await rateLimit({ bucket: `submit:hr:${ip}`, limit: 20, windowSeconds: 3600 });
  if (!okMin || !okHr) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Step body — implementation continues in Task 4.3
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
```

- [ ] **Step 2: Smoke test validation**

```bash
curl -X POST http://localhost:3000/api/guest/submit \
  -H 'content-type: application/json' \
  -d '{}' -i
```

Expected: 400 `bad_request`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/guest/submit/route.ts
git commit -m "feat(guest): /api/guest/submit input validation skeleton"
```

### Task 4.3: `/api/guest/submit` — full implementation

**Files:**
- Modify: `src/app/api/guest/submit/route.ts`

- [ ] **Step 1: Replace the route body with full impl**

Replace the entire file with:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { conflict } from '@/lib/guest/conflict';
import type { ChapterCode, MemberForConflict } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { getGhlClient } from '@/lib/guest/ghl';
import { getEmailClient } from '@/lib/guest/email';
import { buildIcs } from '@/lib/guest/ics';
import { mintMagic } from '@/lib/guest/magic';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const submitSchema = z.object({
  token: z.string(),
  session_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  business_name: z.string().min(1).max(200),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  event_id: z.string().uuid(),
  industry_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  other_category_text: z.string().max(200).nullable(),
  invited_by_member_id: z.string().uuid().nullable(),
  qr_token_id: z.string().uuid().nullable(),
}).refine(
  (d) => (d.industry_id && d.category_id) || (!!d.other_category_text),
  { message: 'Provide industry+category OR other_category_text' },
);

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const okMin = await rateLimit({ bucket: `submit:min:${ip}`, limit: 5, windowSeconds: 60 });
  const okHr = await rateLimit({ bucket: `submit:hr:${ip}`, limit: 20, windowSeconds: 3600 });
  if (!okMin || !okHr) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // 1) Event must be public_visible and in the future.
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id,title,description,location_name,location_address,starts_at,ends_at,ics_uid,public_visible')
    .eq('id', p.event_id)
    .single();
  if (evErr || !event) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!event.public_visible || new Date(event.starts_at) < new Date()) {
    return NextResponse.json({ error: 'event_closed' }, { status: 410 });
  }

  // 2) Re-fetch members and compute conflict server-side (source of truth).
  const { data: members } = await sb
    .from('members')
    .select('id,chapter,industry_id,category_id,full_name,business_name')
    .eq('chapter', p.chapter);
  const cf = conflict({
    chapter: p.chapter as ChapterCode,
    industry_id: p.industry_id,
    category_id: p.category_id,
    members_in_chapter: (members ?? []) as MemberForConflict[],
  });

  // 3) Detect existing-member by email
  const emailNormalized = p.email.trim().toLowerCase();
  const { data: existingMember } = await sb
    .from('members')
    .select('id')
    .eq('email', emailNormalized)
    .maybeSingle();
  const isExistingMember = !!existingMember;

  // 4) Upsert intake_guest
  const { data: guest, error: guestErr } = await sb
    .from('intake_guests')
    .upsert(
      {
        email: p.email.trim(),
        email_normalized: emailNormalized,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        business_name: p.business_name.trim(),
        industry_id: p.industry_id,
        category_id: p.category_id,
        other_category_text: p.other_category_text?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email_normalized' },
    )
    .select('id')
    .single();
  if (guestErr || !guest) {
    console.error('intake_guests upsert', guestErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // 5) Idempotent RSVP insert; if existing canceled row, flip to registered.
  const { data: existingRsvp } = await sb
    .from('intake_rsvps')
    .select('id,status')
    .eq('guest_id', guest.id)
    .eq('event_id', p.event_id)
    .maybeSingle();

  let rsvpId: string;
  if (existingRsvp && existingRsvp.status !== 'canceled') {
    rsvpId = existingRsvp.id;
  } else if (existingRsvp && existingRsvp.status === 'canceled') {
    const { error: upErr } = await sb
      .from('intake_rsvps')
      .update({ status: 'registered', conflict_kind: cf.kind, conflict_member_id: cf.occupants[0]?.id ?? null })
      .eq('id', existingRsvp.id);
    if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    rsvpId = existingRsvp.id;
  } else {
    const { data: rsvp, error: rsErr } = await sb
      .from('intake_rsvps')
      .insert({
        guest_id: guest.id,
        event_id: p.event_id,
        qr_token_id: p.qr_token_id,
        invited_by_member_id: p.invited_by_member_id,
        conflict_kind: cf.kind,
        conflict_member_id: cf.occupants[0]?.id ?? null,
        status: 'registered',
        notes: isExistingMember ? 'existing-member' : null,
      })
      .select('id')
      .single();
    if (rsErr || !rsvp) {
      console.error('intake_rsvps insert', rsErr);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    rsvpId = rsvp.id;

    // conflict_log only on first insert
    await sb.from('intake_conflict_log').insert({
      rsvp_id: rsvpId,
      chapter: p.chapter,
      industry_id: p.industry_id,
      category_id: p.category_id,
      conflict_kind: cf.kind,
      occupants_snapshot: cf.occupants.map((m) => ({
        member_id: m.id,
        full_name: m.full_name,
        business_name: m.business_name,
        category_id: m.category_id,
      })),
    });
  }

  // 6) Magic link (only mint a fresh one — store hash on guest)
  const magic = mintMagic({ ttlDays: 30 });
  await sb
    .from('intake_guests')
    .update({
      magic_token_hash: magic.hash,
      magic_expires_at: magic.expires_at.toISOString(),
    })
    .eq('id', guest.id);

  // 7) Clean up the wizard session
  await sb.from('intake_sessions').delete().eq('id', p.session_id);

  // 8) Side effects (non-blocking — log failures, never throw)
  if (!isExistingMember) {
    try {
      const ghl = getGhlClient();
      const r = await ghl.upsertContact({
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        business_name: p.business_name,
        tags: ['guest-intake', `chapter:${p.chapter}`, `event:${event.id}`],
      });
      await sb.from('intake_guests').update({ ghl_contact_id: r.contact_id }).eq('id', guest.id);
    } catch (e) {
      await sb.from('intake_side_effect_failures').insert({
        rsvp_id: rsvpId,
        kind: 'ghl',
        error_msg: String(e),
      });
    }
  }

  try {
    const email = getEmailClient();
    const ics = buildIcs({
      uid: event.ics_uid,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location_name
        ? `${event.location_name}${event.location_address ? `, ${event.location_address}` : ''}`
        : event.location_address ?? undefined,
      starts_at: new Date(event.starts_at),
      ends_at: new Date(event.ends_at),
    });
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;
    await email.sendConfirmation({
      to: p.email,
      guest_first_name: p.first_name,
      event_title: event.title,
      event_starts_at: new Date(event.starts_at),
      event_location: event.location_name ?? event.location_address ?? '',
      ics_attachment: ics,
      magic_link: `${origin}/guest/me?t=${magic.token}`,
    });
  } catch (e) {
    await sb.from('intake_side_effect_failures').insert({
      rsvp_id: rsvpId,
      kind: 'email',
      error_msg: String(e),
    });
  }

  return NextResponse.json({ rsvp_id: rsvpId, conflict_kind: cf.kind });
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/guest/submit/route.ts
git commit -m "feat(guest): /api/guest/submit full implementation"
```

### Task 4.4: `/api/guest/magic` GET (verify and set cookie)

**Files:**
- Create: `src/app/api/guest/magic/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/guest/magic/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { hashMagic } from '@/lib/guest/magic';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  if (!token) return NextResponse.redirect(new URL('/guest/error/bad-link', req.url));

  const sb = getServerSupabase();
  const hash = hashMagic(token);
  const { data: guest } = await sb
    .from('intake_guests')
    .select('id,magic_expires_at')
    .eq('magic_token_hash', hash)
    .maybeSingle();

  if (!guest) {
    return NextResponse.redirect(new URL('/guest/error/bad-link', req.url));
  }
  if (new Date(guest.magic_expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/guest/error/expired-link', req.url));
  }

  const res = NextResponse.redirect(new URL('/guest/me', req.url));
  res.cookies.set('intake_guest_id', guest.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/guest/magic/route.ts
git commit -m "feat(guest): /api/guest/magic GET (verify + cookie)"
```

### Task 4.5: `/api/guest/magic/refresh` POST

**Files:**
- Create: `src/app/api/guest/magic/refresh/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/guest/magic/refresh/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { getEmailClient } from '@/lib/guest/email';
import { mintMagic } from '@/lib/guest/magic';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const ok = await rateLimit({ bucket: `magic-refresh:${ip}`, limit: 3, windowSeconds: 600 });
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  // Always 200 to prevent enumeration.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const sb = getServerSupabase();
  const emailNormalized = parsed.data.email.trim().toLowerCase();
  const { data: guest } = await sb
    .from('intake_guests')
    .select('id,first_name,email')
    .eq('email_normalized', emailNormalized)
    .maybeSingle();

  if (!guest) return NextResponse.json({ ok: true });

  const magic = mintMagic({ ttlDays: 30 });
  await sb
    .from('intake_guests')
    .update({ magic_token_hash: magic.hash, magic_expires_at: magic.expires_at.toISOString() })
    .eq('id', guest.id);

  try {
    const email = getEmailClient();
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;
    // Reuse the confirmation template; send a stripped version with no event.
    // For MVP, send a minimal email via fetch directly; a dedicated template can come later.
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_ADDRESS ?? 'no-reply@businessleadersofcharlotte.com',
        to: guest.email,
        subject: 'Your BLOC link',
        html: `<p>Hi ${guest.first_name}, <a href="${origin}/guest/me?t=${magic.token}">click here to access your RSVPs</a>.</p>`,
      }),
    });
  } catch (e) {
    // Swallow: still return 200 to user.
    console.error('magic refresh email', e);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/guest/magic/refresh/route.ts
git commit -m "feat(guest): /api/guest/magic/refresh POST"
```

---

## Phase 5 — Public pages

### Task 5.1: Token resolution helper + landing page

**Files:**
- Create: `src/app/guest/i/[token]/_resolve.ts`
- Create: `src/app/guest/i/[token]/page.tsx`

- [ ] **Step 1: Write the resolver**

Create `src/app/guest/i/[token]/_resolve.ts`:

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/guest/tokens';
import type { QrTokenPayload } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export interface ResolvedToken {
  payload: QrTokenPayload;
  qr_token_id: string;
  session_id: string;
}

/**
 * Verify a token, look up its DB row, bump scan_count, and ensure a wizard session exists.
 * Redirects to error pages on failure.
 */
export async function resolveToken(token: string): Promise<ResolvedToken> {
  const payload = await verifyToken(token);
  if (!payload) redirect('/guest/error/bad-link');

  const sb = getServerSupabase();
  const { data: row } = await sb
    .from('qr_tokens')
    .select('id,revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!row) redirect('/guest/error/bad-link');
  if (row.revoked_at) redirect('/guest/error/expired-link');

  const { data: current } = await sb
    .from('qr_tokens')
    .select('scan_count')
    .eq('id', row.id)
    .single();
  await sb
    .from('qr_tokens')
    .update({
      scan_count: (current?.scan_count ?? 0) + 1,
      last_scanned_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  // Ensure a session row exists; cookie holds its id.
  const cookieStore = await cookies();
  let sessionId = cookieStore.get('gsid')?.value;
  let sessionExists = false;
  if (sessionId) {
    const { data: s } = await sb
      .from('intake_sessions')
      .select('id')
      .eq('id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    sessionExists = !!s;
  }
  if (!sessionExists) {
    const { data: created } = await sb
      .from('intake_sessions')
      .insert({
        token,
        current_step: 'landing',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    sessionId = created!.id;
    cookieStore.set('gsid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
  }

  return { payload, qr_token_id: row.id, session_id: sessionId! };
}
```

- [ ] **Step 2: Write the landing page**

Create `src/app/guest/i/[token]/page.tsx`:

```tsx
import Link from 'next/link';
import { resolveToken } from './_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props { params: Promise<{ token: string }> }

export default async function GuestLandingPage({ params }: Props) {
  const { token } = await params;
  const { payload } = await resolveToken(token);
  const sb = getServerSupabase();

  let event = null;
  if (payload.event_id) {
    const { data } = await sb.from('events')
      .select('id,title,starts_at,location_name')
      .eq('id', payload.event_id).single();
    event = data;
  }

  let inviter = null;
  if (payload.invited_by_member_id) {
    const { data } = await sb.from('members')
      .select('full_name')
      .eq('id', payload.invited_by_member_id).single();
    inviter = data;
  }

  const nextStep =
    !payload.event_id ? `event` :
    !payload.chapter ? `chapter` :
    `details`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Welcome to BLOC</h1>
      {inviter && (
        <p className="mt-2 text-gray-700">{inviter.full_name} invited you.</p>
      )}
      {payload.chapter && (
        <p className="mt-1 text-gray-700">Chapter: <strong>{payload.chapter}</strong></p>
      )}
      {event && (
        <p className="mt-1 text-gray-700">
          Event: <strong>{event.title}</strong> on {new Date(event.starts_at).toLocaleString()}
        </p>
      )}
      <Link href={`/guest/i/${token}/${nextStep}`} className="mt-8 inline-block rounded bg-black px-6 py-3 text-white">
        Continue
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/guest/i/[token]/_resolve.ts src/app/guest/i/[token]/page.tsx
git commit -m "feat(guest): token landing page + resolver"
```

### Task 5.2: Event picker page

**Files:**
- Create: `src/app/guest/i/[token]/event/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/guest/i/[token]/event/page.tsx`:

```tsx
import Link from 'next/link';
import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props { params: Promise<{ token: string }> }

export default async function EventPickerPage({ params }: Props) {
  const { token } = await params;
  const { payload } = await resolveToken(token);

  if (payload.event_id) {
    // Token already pinned event; skip ahead
    const next = payload.chapter ? 'details' : 'chapter';
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>Redirecting…</p>
        <meta httpEquiv="refresh" content={`0;url=/guest/i/${token}/${next}`} />
      </main>
    );
  }

  const sb = getServerSupabase();
  let q = sb
    .from('events')
    .select('id,title,description,location_name,starts_at,chapter,kind')
    .eq('public_visible', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (payload.chapter) q = q.eq('chapter', payload.chapter);
  const { data: events } = await q;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Pick an event</h1>
      <ul className="mt-6 space-y-4">
        {(events ?? []).map((e) => (
          <li key={e.id} className="rounded border p-4">
            <Link href={`/guest/i/${token}/${payload.chapter ? 'details' : 'chapter'}?event=${e.id}`} className="block">
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-gray-600">{new Date(e.starts_at).toLocaleString()}</div>
              {e.location_name && <div className="text-sm text-gray-600">{e.location_name}</div>}
            </Link>
          </li>
        ))}
        {events?.length === 0 && <li className="text-gray-600">No upcoming events.</li>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/guest/i/[token]/event/page.tsx
git commit -m "feat(guest): event picker page"
```

### Task 5.3: Chapter roster preview page

**Files:**
- Create: `src/app/guest/i/[token]/chapter/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/guest/i/[token]/chapter/page.tsx`:

```tsx
import Link from 'next/link';
import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ event?: string }>;
}

export default async function ChapterRosterPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const { payload } = await resolveToken(token);

  const chapter = payload.chapter;
  if (!chapter) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>This link doesn't include a chapter. Please pick from the public site.</p>
      </main>
    );
  }

  const sb = getServerSupabase();
  // Visible members for this chapter, joined to category for display labels
  const { data: rows } = await sb
    .from('chapter_member_visibility')
    .select(`
      member_id,
      public_business_name,
      members!inner(id,full_name,business_name)
    `)
    .eq('chapter', chapter)
    .eq('visible', true);

  const eventQs = sp.event ? `?event=${sp.event}` : '';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">BLOC {chapter} members</h1>
      <p className="mt-2 text-gray-600">A look at the room you'd be joining.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {(rows ?? []).map((r) => {
          const m = (r as { members: { id: string; full_name: string; business_name: string } }).members;
          const business = r.public_business_name ?? m.business_name;
          return (
            <li key={m.id} className="rounded border p-4">
              <div className="font-medium">{m.full_name}</div>
              <div className="text-sm text-gray-600">{business}</div>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/guest/i/${token}/details${eventQs}`}
        className="mt-8 inline-block rounded bg-black px-6 py-3 text-white"
      >
        I'd like to attend
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/guest/i/[token]/chapter/page.tsx
git commit -m "feat(guest): chapter roster preview page"
```

### Task 5.4: Details page server shell + client form island

**Files:**
- Create: `src/app/guest/i/[token]/details/page.tsx`
- Create: `src/app/guest/i/[token]/details/GuestDetailsForm.tsx`

- [ ] **Step 1: Write the server shell**

Create `src/app/guest/i/[token]/details/page.tsx`:

```tsx
import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { GuestDetailsForm } from './GuestDetailsForm';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ event?: string }>;
}

export default async function DetailsPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const { payload, qr_token_id, session_id } = await resolveToken(token);

  const sb = getServerSupabase();
  const [{ data: industries }, { data: categories }] = await Promise.all([
    sb.from('industry_categories').select('id,name,display_order').order('display_order'),
    sb.from('industry_targets').select('id,category_id,title').order('title'),
  ]);

  const event_id = payload.event_id ?? sp.event ?? null;
  if (!event_id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>Please pick an event first. <a href={`/guest/i/${token}/event`}>Go back</a></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your details</h1>
      <GuestDetailsForm
        token={token}
        sessionId={session_id}
        chapter={payload.chapter ?? 'Uptown'}
        eventId={event_id}
        invitedByMemberId={payload.invited_by_member_id ?? null}
        qrTokenId={qr_token_id}
        industries={(industries ?? []).map((i) => ({ id: i.id, name: i.name }))}
        categories={(categories ?? []).map((c) => ({ id: c.id, industry_id: c.category_id, name: c.title }))}
      />
    </main>
  );
}
```

- [ ] **Step 2: Write the client island**

Create `src/app/guest/i/[token]/details/GuestDetailsForm.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Industry { id: string; name: string }
interface Category { id: string; industry_id: string; name: string }
interface Conflict { kind: 'none'|'exact'|'related'|'other'; occupant: { full_name: string; business_name: string } | null }

interface Props {
  token: string;
  sessionId: string;
  chapter: string;
  eventId: string;
  invitedByMemberId: string | null;
  qrTokenId: string;
  industries: Industry[];
  categories: Category[];
}

export function GuestDetailsForm(props: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () => props.categories.filter((c) => c.industry_id === industryId),
    [props.categories, industryId],
  );

  // Live conflict check, debounced
  useEffect(() => {
    if (!industryId && !categoryId) { setConflict(null); return; }
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          chapter: props.chapter,
          ...(industryId ? { industry_id: industryId } : {}),
          ...(categoryId ? { category_id: categoryId } : {}),
        });
        const res = await fetch(`/api/guest/check-conflict?${qs}`, { signal: ac.signal });
        if (res.ok) setConflict(await res.json());
      } catch {}
    }, 300);
    return () => { clearTimeout(id); ac.abort(); };
  }, [props.chapter, industryId, categoryId]);

  const isOther = !industryId || !categoryId;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/guest/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: props.token,
          session_id: props.sessionId,
          first_name: firstName,
          last_name: lastName,
          email,
          business_name: businessName,
          chapter: props.chapter,
          event_id: props.eventId,
          industry_id: isOther ? null : industryId,
          category_id: isOther ? null : categoryId,
          other_category_text: isOther ? (otherText || null) : null,
          invited_by_member_id: props.invitedByMemberId,
          qr_token_id: props.qrTokenId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMsg(body?.error ?? `error_${res.status}`);
        setSubmitting(false);
        return;
      }
      router.push(`/guest/i/${props.token}/confirm?rsvp=${body.rsvp_id}`);
    } catch {
      setErrorMsg('network_error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field label="Business name" value={businessName} onChange={setBusinessName} />

      <div>
        <label className="block text-sm font-medium">Industry</label>
        <select
          className="mt-1 w-full rounded border p-2"
          value={industryId ?? ''}
          onChange={(e) => { setIndustryId(e.target.value || null); setCategoryId(null); }}
        >
          <option value="">— Select industry —</option>
          {props.industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Don&apos;t see your industry? Leave both selectors blank and describe your business below.</p>
      </div>

      {industryId && (
        <div>
          <label className="block text-sm font-medium">Category</label>
          <select
            className="mt-1 w-full rounded border p-2"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
          >
            <option value="">— Select category —</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {isOther && (
        <Field label="Describe your business" value={otherText} onChange={setOtherText} />
      )}

      {conflict && conflict.kind !== 'none' && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {conflict.kind === 'exact' && conflict.occupant && (
            <>Heads up — <strong>{conflict.occupant.full_name}</strong> ({conflict.occupant.business_name}) currently holds this category seat in {props.chapter}. You're welcome to attend as a guest of the chapter.</>
          )}
          {conflict.kind === 'related' && conflict.occupant && (
            <>FYI — <strong>{conflict.occupant.full_name}</strong> ({conflict.occupant.business_name}) is in a related category in {props.chapter}. You're still welcome to attend.</>
          )}
          {conflict.kind === 'other' && (
            <>We'll review your business and follow up about the right category for you.</>
          )}
        </div>
      )}

      {errorMsg && <p className="text-sm text-red-600">Error: {errorMsg}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {submitting ? 'Registering…' : 'Register for this event'}
      </button>
    </form>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium">{props.label}</label>
      <input
        className="mt-1 w-full rounded border p-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={props.type ?? 'text'}
        required={props.label !== 'Describe your business'}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/guest/i/[token]/details/page.tsx src/app/guest/i/[token]/details/GuestDetailsForm.tsx
git commit -m "feat(guest): details form with live conflict check"
```

### Task 5.5: Confirmation page

**Files:**
- Create: `src/app/guest/i/[token]/confirm/page.tsx`
- Create: `src/app/api/guest/ics/[rsvp]/route.ts`

- [ ] **Step 1: Write the confirm page**

Create `src/app/guest/i/[token]/confirm/page.tsx`:

```tsx
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}

export default async function ConfirmPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  if (!sp.rsvp) {
    return <main className="mx-auto max-w-2xl px-6 py-12"><p>Missing RSVP id.</p></main>;
  }
  const sb = getServerSupabase();
  const { data: rsvp } = await sb
    .from('intake_rsvps')
    .select('id,events!inner(title,starts_at,location_name)')
    .eq('id', sp.rsvp)
    .maybeSingle();
  if (!rsvp) {
    return <main className="mx-auto max-w-2xl px-6 py-12"><p>RSVP not found.</p></main>;
  }
  const ev = (rsvp as { events: { title: string; starts_at: string; location_name: string | null } }).events;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">You're registered.</h1>
      <p className="mt-3 text-lg">{ev.title}</p>
      <p className="text-gray-600">{new Date(ev.starts_at).toLocaleString()}{ev.location_name ? ` · ${ev.location_name}` : ''}</p>
      <a
        href={`/api/guest/ics/${rsvp.id}`}
        download="event.ics"
        className="mt-8 inline-block rounded bg-black px-6 py-3 text-white"
      >
        Add to calendar
      </a>
      <p className="mt-6 text-sm text-gray-600">We've emailed your confirmation with the calendar invite attached.</p>
      <p className="mt-2 text-sm text-gray-600">Token: {token.slice(0, 8)}…</p>
    </main>
  );
}
```

- [ ] **Step 2: Write the ICS download route**

Create `src/app/api/guest/ics/[rsvp]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { buildIcs } from '@/lib/guest/ics';

interface Props { params: Promise<{ rsvp: string }> }

export async function GET(_: Request, { params }: Props) {
  const { rsvp } = await params;
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('intake_rsvps')
    .select('events!inner(title,description,location_name,location_address,starts_at,ends_at,ics_uid)')
    .eq('id', rsvp)
    .single();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ev = (data as { events: { title: string; description: string | null; location_name: string | null; location_address: string | null; starts_at: string; ends_at: string; ics_uid: string } }).events;
  const ics = buildIcs({
    uid: ev.ics_uid,
    title: ev.title,
    description: ev.description ?? undefined,
    location: ev.location_name ? `${ev.location_name}${ev.location_address ? `, ${ev.location_address}` : ''}` : ev.location_address ?? undefined,
    starts_at: new Date(ev.starts_at),
    ends_at: new Date(ev.ends_at),
  });
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event.ics"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/guest/i/[token]/confirm/page.tsx src/app/api/guest/ics/[rsvp]/route.ts
git commit -m "feat(guest): confirm page + ICS download route"
```

### Task 5.6: Magic-link return page (`/guest/me`)

**Files:**
- Create: `src/app/guest/me/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/guest/me/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export default async function MePage() {
  const cookieStore = await cookies();
  const guestId = cookieStore.get('intake_guest_id')?.value;
  if (!guestId) redirect('/guest/error/bad-link');

  const sb = getServerSupabase();
  const { data: rsvps } = await sb
    .from('intake_rsvps')
    .select('id,status,events!inner(title,starts_at,location_name)')
    .eq('guest_id', guestId)
    .order('submitted_at', { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your RSVPs</h1>
      <ul className="mt-6 space-y-3">
        {(rsvps ?? []).map((r) => {
          const ev = (r as { events: { title: string; starts_at: string; location_name: string | null } }).events;
          return (
            <li key={r.id} className="rounded border p-4">
              <div className="font-medium">{ev.title}</div>
              <div className="text-sm text-gray-600">
                {new Date(ev.starts_at).toLocaleString()}{ev.location_name ? ` · ${ev.location_name}` : ''}
              </div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">{r.status}</div>
              <a href={`/api/guest/ics/${r.id}`} download="event.ics" className="text-sm underline">Add to calendar</a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/guest/me/page.tsx
git commit -m "feat(guest): magic-link return page /guest/me"
```

### Task 5.7: Error pages

**Files:**
- Create: `src/app/guest/error/[code]/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/guest/error/[code]/page.tsx`:

```tsx
import Link from 'next/link';

interface Props { params: Promise<{ code: string }> }

const messages: Record<string, { title: string; body: string }> = {
  'bad-link': {
    title: 'This link looks broken.',
    body: 'The link you followed isn\'t valid. Try the public site or ask whoever invited you to send a new one.',
  },
  'expired-link': {
    title: 'This link has expired.',
    body: 'You can request a new one below.',
  },
};

export default async function GuestErrorPage({ params }: Props) {
  const { code } = await params;
  const m = messages[code] ?? messages['bad-link'];
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{m.title}</h1>
      <p className="mt-3 text-gray-700">{m.body}</p>
      <Link href="/guest" className="mt-6 inline-block underline">Go to the public guest page</Link>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/guest/error/[code]/page.tsx
git commit -m "feat(guest): error pages"
```

### Task 5.8: Generic `/guest` landing (no token)

**Files:**
- Create: `src/app/guest/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/guest/page.tsx`:

```tsx
import { getServerSupabase } from '@/lib/guest/supabase-server';

export default async function GuestRootPage() {
  const sb = getServerSupabase();
  const { data: events } = await sb
    .from('events')
    .select('id,title,starts_at,location_name,chapter')
    .eq('public_visible', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Visit BLOC as a guest</h1>
      <p className="mt-3 text-gray-700">Pick an upcoming event to RSVP to.</p>
      <p className="mt-6 text-sm text-gray-600">To register, scan the QR code at any BLOC event or ask the member who invited you for their personal QR link.</p>
      <ul className="mt-6 space-y-3">
        {(events ?? []).map((e) => (
          <li key={e.id} className="rounded border p-4">
            <div className="font-medium">{e.title}</div>
            <div className="text-sm text-gray-600">
              {new Date(e.starts_at).toLocaleString()}{e.location_name ? ` · ${e.location_name}` : ''}
              {e.chapter && ` · BLOC ${e.chapter}`}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

For MVP the no-token path lists upcoming events but doesn't accept registrations — the QR is the entry point. A self-service no-token registration is a follow-up spec.

- [ ] **Step 2: Commit**

```bash
git add src/app/guest/page.tsx
git commit -m "feat(guest): generic /guest landing page"
```

---

## Phase 6 — End-to-end test + final wiring

### Task 6.1: Seed an admin-mintable token route (dev convenience)

**Files:**
- Create: `src/app/api/guest/dev/mint/route.ts`

- [ ] **Step 1: Write the route (dev only)**

Create `src/app/api/guest/dev/mint/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { signToken } from '@/lib/guest/tokens';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import type { ChapterCode, QrTokenKind } from '@/lib/guest/types';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const kind: QrTokenKind = body.kind ?? 'general';
  const chapter: ChapterCode | undefined = body.chapter;
  const event_id: string | undefined = body.event_id;
  const invited_by_member_id: string | undefined = body.invited_by_member_id;
  const label: string | undefined = body.label;

  const sb = getServerSupabase();
  // Insert with a unique placeholder, then update to the real signed token
  const placeholder = `pending-${crypto.randomUUID()}`;
  const { data: row } = await sb
    .from('qr_tokens')
    .insert({
      token: placeholder,
      kind,
      chapter,
      event_id,
      invited_by_member_id,
      label: label ?? `dev-${new Date().toISOString()}`,
    })
    .select('id')
    .single();
  if (!row) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const token = await signToken({ kind, chapter, event_id, invited_by_member_id, qr_id: row.id });
  await sb.from('qr_tokens').update({ token }).eq('id', row.id);

  return NextResponse.json({ token, url: `/guest/i/${token}` });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/guest/dev/mint/route.ts
git commit -m "feat(guest): dev-only token mint route"
```

### Task 6.2: Manual end-to-end smoke test

- [ ] **Step 1: Seed a real upcoming event**

Via Supabase MCP `execute_sql`:

```sql
INSERT INTO events (chapter, kind, title, description, starts_at, ends_at, location_name, location_address, ics_uid)
VALUES (
  'Uptown',
  'after_hours',
  'BLOC Uptown After Hours (Smoke Test)',
  'Smoke-test event',
  NOW() + INTERVAL '7 days',
  NOW() + INTERVAL '7 days' + INTERVAL '2 hours',
  'Slate Billiards',
  'Charlotte NC',
  CONCAT('event-uptown-after-hours-', extract(epoch from now())::text, '@bloc')
);
```

Note the returned `id`.

- [ ] **Step 2: Mint a member-invite token**

Pick an existing member's id from `members` table, then:

```bash
curl -X POST http://localhost:3000/api/guest/dev/mint \
  -H 'content-type: application/json' \
  -d '{
    "kind": "member_invite",
    "chapter": "Uptown",
    "event_id": "<event_id>",
    "invited_by_member_id": "<member_id>",
    "label": "smoke-test"
  }'
```

Note the returned `url`.

- [ ] **Step 3: Walk the flow in a browser**

1. Open the returned URL.
2. Click "Continue" — should land on chapter roster (token has chapter+event pinned, event step skipped).
3. Click "I'd like to attend" — lands on details form.
4. Pick an Industry+Category that matches a member of the chapter; the soft-warn should appear.
5. Submit.
6. Lands on confirm page; click "Add to calendar"; verify `.ics` downloads and opens in your calendar app.
7. Check Supabase: `SELECT * FROM intake_guests`, `intake_rsvps`, `intake_conflict_log`. All should have the right rows.
8. Check `intake_side_effect_failures`: if no `RESEND_API_KEY` is set, expect zero rows (mock client succeeds). If set with bad key, expect one row of `kind = 'email'`.

- [ ] **Step 4: Document the smoke test outcome inline**

If anything fails, fix before proceeding.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(guest): post-smoke-test fixes"
```

(Skip if no fixes were needed.)

### Task 6.3: Optional — Playwright e2e test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/guest-flow.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Configure**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the e2e test**

Create `e2e/guest-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('guest intake flow: scan → roster → details → soft-warn → submit → confirm', async ({ page, request }) => {
  // Mint a token via the dev route
  const mint = await request.post('/api/guest/dev/mint', {
    data: { kind: 'general', chapter: 'Uptown', label: 'e2e' },
  });
  expect(mint.ok()).toBeTruthy();
  const { url } = await mint.json();

  await page.goto(url);
  await expect(page.getByText(/Welcome to BLOC/)).toBeVisible();

  await page.getByRole('link', { name: /continue/i }).click();
  // Event picker (token has no event pinned)
  const firstEvent = page.locator('a[href^="/guest/i/"][href*="?event="]').first();
  await expect(firstEvent).toBeVisible();
  await firstEvent.click();

  // Chapter roster preview
  await expect(page.getByText(/BLOC Uptown members/)).toBeVisible();
  await page.getByRole('link', { name: /I'd like to attend/i }).click();

  // Details form
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('Guest');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Business name').fill('Test Co');

  // Don't pick industry/category — submit as Other
  await page.getByLabel('Describe your business').fill('Generic test business');
  await page.getByRole('button', { name: /Register for this event/i }).click();

  // Confirm page
  await expect(page.getByText(/You're registered\./i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /Add to calendar/i })).toBeVisible();
});
```

- [ ] **Step 4: Run the test**

```bash
npx playwright test
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/guest-flow.spec.ts package.json package-lock.json
git commit -m "test(guest): playwright e2e for the happy path"
```

---

## Self-review

Before claiming this plan complete, the engineer should verify:

- [ ] Every spec section maps to at least one task. (Spec sections 4–11 → tasks across phases 1–6.)
- [ ] No `TBD` or placeholder language inside task code blocks.
- [ ] Type names used in later tasks (`MemberForConflict`, `ChapterCode`, `QrTokenPayload`, `ConflictResult`, `IcsEvent`, `EmailConfirmationInput`, `GhlContactInput`) are defined in earlier tasks (2.1, 2.5, 2.7, 3.1, 3.2).
- [ ] Table names referenced in routes (`intake_guests`, `intake_rsvps`, `intake_conflict_log`, `intake_side_effect_failures`, `intake_sessions`, `intake_rate_limits`, `qr_tokens`, `events`, `chapter_member_visibility`, `industry_categories`, `industry_targets`, `members`) match migrations.
- [ ] All env vars referenced (`GUEST_TOKEN_SECRET`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) are in `.env.local.example`.

If any check fails, fix inline.
