# After Hours Member Tier, Pending Applicants & Chapter Lunch Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "After Hours" member tier (members with no chapter, excluded from the 125 goal), track pending applicants in the pipeline, and put a Register / Share / QR lunch link on each chapter card.

**Architecture:** A new nullable `member_type` concept on the `members` table (chapter becomes nullable). Counting logic moves into a pure, unit-tested helper. Lunch URLs are stored as `dashboard_settings` key/value rows and surfaced via a reusable `LunchLink` component that wraps a share util and the existing `QrImage`.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Supabase (Postgres + REST), Tailwind, Vitest, `qrcode`, lucide-react.

Spec: `docs/superpowers/specs/2026-05-27-after-hours-member-tier-design.md`

---

## File Structure

- `supabase/migrations/016_after_hours_member_tier.sql` — **create**: schema change + seed lunch URLs.
- `src/types/index.ts` — **modify**: `Member.chapter` nullable, add `Member.memberType`.
- `src/lib/members/summary.ts` — **create**: pure counting helper.
- `src/lib/members/summary.test.ts` — **create**: tests for the helper.
- `src/hooks/useMembers.ts` — **modify**: map `member_type`/null chapter; expose `fullMemberCount` + `afterHoursCount`; use the helper.
- `src/hooks/useDashboardSettings.ts` — **modify**: lunch-URL defaults + `chapterLunchUrls` getter.
- `src/lib/share.ts` — **create**: `shareLink()` util (Web Share + clipboard fallback).
- `src/lib/share.test.ts` — **create**: tests for `shareLink()`.
- `src/components/ui/LunchLink.tsx` — **create**: Register + Share + QR row.
- `src/components/ui/index.ts` — **modify**: export `LunchLink`.
- `src/components/tabs/DashboardTab.tsx` — **modify**: full-member count, After Hours stat card, lunch links in chapter cards.
- `src/components/tabs/MembersTab.tsx` — **modify**: After Hours filter chip, dropdown option, badge, filter logic.
- `scripts/import_after_hours_and_pending.py` — **create**: one-time idempotent data import.

---

## Task 1: Database migration (schema + seed lunch URLs)

**Files:**
- Create: `supabase/migrations/016_after_hours_member_tier.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/016_after_hours_member_tier.sql`:

```sql
-- ============================================================
-- Migration 016: After Hours member tier + chapter lunch URLs
-- ============================================================

-- 1. New member tier. Existing rows default to 'full'.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'full';

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_member_type_check;
ALTER TABLE members
  ADD CONSTRAINT members_member_type_check
  CHECK (member_type IN ('full', 'after_hours'));

-- 2. Chapter becomes optional (After Hours members have no chapter yet).
ALTER TABLE members
  ALTER COLUMN chapter DROP NOT NULL;

ALTER TABLE members
  DROP CONSTRAINT IF EXISTS members_chapter_check;
ALTER TABLE members
  ADD CONSTRAINT members_chapter_check
  CHECK (chapter IS NULL OR chapter IN ('North','South','Uptown','FLOC','Alumni'));

-- 3. Seed per-chapter lunch registration URLs (admin-editable via dashboard_settings).
INSERT INTO dashboard_settings (key, value) VALUES
  ('lunch_url_south',  'https://businessleadersofcharlotte.com/event-6651645/Registration'),
  ('lunch_url_floc',   'https://businessleadersofcharlotte.com/event-6484425/Registration'),
  ('lunch_url_uptown', 'https://businessleadersofcharlotte.com/event-6484396/Registration'),
  ('lunch_url_north',  'https://businessleadersofcharlotte.com/event-6484506/Registration')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

- [ ] **Step 2: Apply the migration to the live DB**

The service-role REST key cannot run DDL. Apply this in the Supabase SQL editor:
`https://supabase.com/dashboard/project/ksmtkisknnvrjdfigsll/sql/new` — paste the
file contents and Run. (Alternatively, if the Supabase CLI is linked: `supabase db push`.)

Expected: "Success. No rows returned" for the ALTERs; the INSERT upserts 4 rows.

- [ ] **Step 3: Verify schema + seed via REST**

Run:
```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard" && python3 - <<'PY'
import os,urllib.request,json
for line in open('.env.local'):
    line=line.strip()
    if line and not line.startswith('#') and '=' in line:
        k,v=line.split('=',1);os.environ.setdefault(k.strip(),v.strip())
URL=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/');KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']
def g(p):
    r=urllib.request.Request(URL+'/rest/v1/'+p,headers={'apikey':KEY,'Authorization':'Bearer '+KEY})
    return json.loads(urllib.request.urlopen(r).read())
# member_type column exists and defaults to 'full'
print("sample member_type:", g('members?select=name,member_type,chapter&limit=2'))
# lunch urls seeded
print("lunch urls:", g("dashboard_settings?select=key,value&key=like.lunch_url_*"))
PY
```
Expected: members show `"member_type": "full"`; four `lunch_url_*` rows print with the URLs.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_after_hours_member_tier.sql
git commit -m "feat(db): add member_type tier, nullable chapter, seed chapter lunch URLs"
```

---

## Task 2: Type changes

**Files:**
- Modify: `src/types/index.ts:42-60`

- [ ] **Step 1: Update the `Member` interface**

In `src/types/index.ts`, replace the `Member` interface (currently lines 42-60) with:

```typescript
// Member interface
export interface Member {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName | null;
  industry: string;
  /** 'full' chapter member, or 'after_hours' wait-list tier (no chapter). */
  memberType?: 'full' | 'after_hours';
  email?: string;
  phone?: string;
  title?: string;
  website?: string;
  description?: string;
  address?: string;
  mobilePhone?: string;
  birthday?: string;
  memberSince?: string;
  renewalDue?: string;
  referredBy?: string;
  joinDate?: string;
}
```

`memberType` is optional so the 94 static fallback rows in `src/data/members.ts`
(all full members) keep type-checking; absence is treated as `'full'`.

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: passes for `src/types/index.ts`. (Other files referencing `member.chapter`
may now flag null — those are fixed in Tasks 3, 6, 7. If errors appear ONLY in
`useMembers.ts`, `DashboardTab.tsx`, `MembersTab.tsx`, that is expected at this point.)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): Member.chapter nullable + optional memberType"
```

---

## Task 3: Pure member-summary helper + wire into useMembers

**Files:**
- Create: `src/lib/members/summary.ts`
- Test: `src/lib/members/summary.test.ts`
- Modify: `src/hooks/useMembers.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/members/summary.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import { isAfterHours, summarizeMembers } from './summary';
import type { Member } from '@/types';

const m = (over: Partial<Member>): Member => ({
  id: Math.random().toString(),
  name: 'X',
  company: 'C',
  chapter: 'North',
  industry: 'I',
  ...over,
});

describe('isAfterHours()', () => {
  test('true only when memberType is after_hours', () => {
    expect(isAfterHours(m({ memberType: 'after_hours', chapter: null }))).toBe(true);
    expect(isAfterHours(m({ memberType: 'full' }))).toBe(false);
    expect(isAfterHours(m({}))).toBe(false); // undefined => full
  });
});

describe('summarizeMembers()', () => {
  test('chapterCounts and fullMemberCount count only full members', () => {
    const members: Member[] = [
      m({ chapter: 'North' }),
      m({ chapter: 'North' }),
      m({ chapter: 'South' }),
      m({ memberType: 'after_hours', chapter: null }),
    ];
    const s = summarizeMembers(members);
    expect(s.chapterCounts.North).toBe(2);
    expect(s.chapterCounts.South).toBe(1);
    expect(s.chapterCounts.Uptown).toBe(0);
    expect(s.fullMemberCount).toBe(3);
    expect(s.afterHoursCount).toBe(1);
  });

  test('an after_hours member with a stray chapter is never counted in chapterCounts', () => {
    const s = summarizeMembers([m({ memberType: 'after_hours', chapter: 'North' })]);
    expect(s.chapterCounts.North).toBe(0);
    expect(s.afterHoursCount).toBe(1);
    expect(s.fullMemberCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/members/summary.test.ts`
Expected: FAIL — cannot find module `./summary`.

- [ ] **Step 3: Write the helper**

Create `src/lib/members/summary.ts`:

```typescript
import type { Member, ChapterName } from '@/types';

const CHAPTERS: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

/** A member is "after hours" only when explicitly tagged; undefined => full. */
export function isAfterHours(member: Member): boolean {
  return member.memberType === 'after_hours';
}

export interface MemberSummary {
  chapterCounts: Record<ChapterName, number>;
  fullMemberCount: number;
  afterHoursCount: number;
}

/** Pure roster summary. Only full members count toward chapters and the total. */
export function summarizeMembers(members: Member[]): MemberSummary {
  const chapterCounts: Record<ChapterName, number> = {
    North: 0, South: 0, Uptown: 0, FLOC: 0, Alumni: 0,
  };
  let fullMemberCount = 0;
  let afterHoursCount = 0;

  for (const member of members) {
    if (isAfterHours(member)) {
      afterHoursCount += 1;
      continue;
    }
    fullMemberCount += 1;
    if (member.chapter && CHAPTERS.includes(member.chapter)) {
      chapterCounts[member.chapter] += 1;
    }
  }

  return { chapterCounts, fullMemberCount, afterHoursCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/members/summary.test.ts`
Expected: PASS (2 suites, all tests green).

- [ ] **Step 5: Wire the helper into `useMembers`**

In `src/hooks/useMembers.ts`:

(a) Add the import near the other imports at the top:

```typescript
import { summarizeMembers } from '@/lib/members/summary';
```

(b) In `transformDbToMember`, change the `chapter` line and add `memberType`:

```typescript
    chapter: (row.chapter ?? null) as ChapterName | null,
    memberType: row.member_type === 'after_hours' ? 'after_hours' : 'full',
```

(c) In `addMember`'s `.insert([{ ... }])` object, change `chapter` and add `member_type`:

```typescript
          chapter: memberData.chapter ?? null,
          member_type: memberData.memberType ?? 'full',
```

(d) In `updateMember`'s `dbUpdates` block, add after the `chapter` line:

```typescript
      if (updates.memberType !== undefined) dbUpdates.member_type = updates.memberType;
```
and change the existing chapter assignment to allow null:
```typescript
      if (updates.chapter !== undefined) dbUpdates.chapter = updates.chapter ?? null;
```

(e) Replace the `membersByChapter` / `chapterCounts` `useMemo` blocks with a single
summary memo plus a derived `membersByChapter`. Find the block starting
`const membersByChapter = useMemo(() => {` and the `const chapterCounts = useMemo(`
block and replace BOTH with:

```typescript
  const summary = useMemo(() => summarizeMembers(members), [members]);
  const chapterCounts = summary.chapterCounts;
  const fullMemberCount = summary.fullMemberCount;
  const afterHoursCount = summary.afterHoursCount;

  const membersByChapter = useMemo(() => {
    const result: Record<ChapterName, Member[]> = {
      North: [], South: [], Uptown: [], FLOC: [], Alumni: [],
    };
    members.forEach((m) => {
      if (m.memberType !== 'after_hours' && m.chapter && result[m.chapter]) {
        result[m.chapter].push(m);
      }
    });
    return result;
  }, [members]);
```

(f) In the hook's `return { ... }`, add `fullMemberCount` and `afterHoursCount`
alongside `chapterCounts`:

```typescript
    chapterCounts,
    fullMemberCount,
    afterHoursCount,
```

- [ ] **Step 6: Verify type-check + tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/members/summary.test.ts`
Expected: tsc passes for `useMembers.ts` and `summary.ts`; tests PASS.
(`DashboardTab.tsx` / `MembersTab.tsx` may still error — fixed in Tasks 6, 7.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/members/summary.ts src/lib/members/summary.test.ts src/hooks/useMembers.ts
git commit -m "feat(members): after_hours-aware counts via pure summarizeMembers helper"
```

---

## Task 4: Lunch URLs in useDashboardSettings

**Files:**
- Modify: `src/hooks/useDashboardSettings.ts`

- [ ] **Step 1: Add lunch URLs to DEFAULTS**

In `src/hooks/useDashboardSettings.ts`, add to the `DEFAULTS` object (after the
`impact_charity` line):

```typescript
  lunch_url_north: '',
  lunch_url_south: '',
  lunch_url_uptown: '',
  lunch_url_floc: '',
```

(Empty string default means "no link" until the DB row is read; the migration
seeds the real values.)

- [ ] **Step 2: Add the `chapterLunchUrls` getter**

After the `chapterGoals` getter block (ends at the line with `Alumni: parseInt(...)`),
add:

```typescript
  const chapterLunchUrls: Record<ChapterName, string> = {
    North: settings.lunch_url_north || '',
    South: settings.lunch_url_south || '',
    Uptown: settings.lunch_url_uptown || '',
    FLOC: settings.lunch_url_floc || '',
    Alumni: settings.lunch_url_alumni || '',
  };
```

- [ ] **Step 3: Return it**

In the hook's `return { ... }`, add after `chapterGoals,`:

```typescript
    chapterLunchUrls,
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: passes for `useDashboardSettings.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDashboardSettings.ts
git commit -m "feat(settings): expose per-chapter lunch registration URLs"
```

---

## Task 5: Share util + LunchLink component

**Files:**
- Create: `src/lib/share.ts`
- Test: `src/lib/share.test.ts`
- Create: `src/components/ui/LunchLink.tsx`
- Modify: `src/components/ui/index.ts`

- [ ] **Step 1: Write the failing test for the share util**

Create `src/lib/share.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareLink } from './share';

describe('shareLink()', () => {
  const origShare = (navigator as any).share;
  const origClipboard = (navigator as any).clipboard;

  afterEach(() => {
    (navigator as any).share = origShare;
    (navigator as any).clipboard = origClipboard;
    vi.restoreAllMocks();
  });

  test('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = share;
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(share).toHaveBeenCalledWith({ title: 'BLOC Lunch', url: 'https://x.test/r' });
    expect(result).toBe('shared');
  });

  test('falls back to clipboard copy when share is unavailable', async () => {
    (navigator as any).share = undefined;
    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(writeText).toHaveBeenCalledWith('https://x.test/r');
    expect(result).toBe('copied');
  });

  test('returns "cancelled" when the user dismisses the share sheet', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' });
    (navigator as any).share = vi.fn().mockRejectedValue(err);
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(result).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/share.test.ts`
Expected: FAIL — cannot find module `./share`.

- [ ] **Step 3: Write the share util**

Create `src/lib/share.ts`:

```typescript
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'error';

/**
 * Share a URL via the Web Share API when available (mobile share sheet),
 * otherwise copy it to the clipboard. Returns what happened so the caller
 * can show the right confirmation.
 */
export async function shareLink(url: string, title: string): Promise<ShareResult> {
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; url?: string }) => Promise<void>;
  };

  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      return 'error';
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'error';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/share.test.ts`
Expected: PASS (3 tests green).

- [ ] **Step 5: Write the LunchLink component**

Create `src/components/ui/LunchLink.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CalendarPlus, Share2, QrCode, X } from 'lucide-react';
import { QrImage } from './QrImage';
import { useToast } from './Toast';
import { shareLink } from '@/lib/share';

interface Props {
  /** Chapter label, e.g. "North". */
  chapter: string;
  /** Registration URL. */
  url: string;
}

/**
 * A compact lunch-registration row: open the page, share the link (native
 * share sheet with clipboard fallback), or pop a scannable QR code.
 */
export function LunchLink({ chapter, url }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const { showToast } = useToast();
  const title = `BLOC ${chapter} Lunch`;

  const handleShare = async () => {
    const result = await shareLink(url, title);
    if (result === 'copied') showToast('Link copied to clipboard');
    else if (result === 'error') showToast('Could not share link');
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-bloc-blue hover:underline font-medium"
      >
        <CalendarPlus size={15} />
        Register for lunch
      </a>
      <button
        type="button"
        onClick={handleShare}
        title="Share registration link"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-bloc-blue transition-colors"
      >
        <Share2 size={15} />
        Share
      </button>
      <button
        type="button"
        onClick={() => setQrOpen((v) => !v)}
        title="Show QR code"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-bloc-blue transition-colors"
      >
        <QrCode size={15} />
        QR
      </button>

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-xl flex flex-col items-center gap-4 max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <p className="font-semibold text-slate-700">{title}</p>
              <button type="button" onClick={() => setQrOpen(false)} aria-label="Close">
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <QrImage url={url} size={220} alt={`${title} registration QR`} />
            <p className="text-xs text-slate-500 text-center break-all">{url}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Export LunchLink**

In `src/components/ui/index.ts`, add after the `QrImage` export line:

```typescript
export { LunchLink } from './LunchLink';
```

- [ ] **Step 7: Verify the toast API matches**

Run: `grep -n "showToast\|useToast\|interface\|=>" src/components/ui/Toast.tsx | head`
Expected: confirms `useToast()` returns an object with a `showToast` function taking
a string. If the function is named differently (e.g. `toast(...)` or `addToast(...)`),
update the call in `LunchLink.tsx` to match before continuing.

- [ ] **Step 8: Verify type-check + tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/share.test.ts`
Expected: tsc passes for the new files; share tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/share.ts src/lib/share.test.ts src/components/ui/LunchLink.tsx src/components/ui/index.ts
git commit -m "feat(ui): LunchLink (register/share/QR) + shareLink util"
```

---

## Task 6: Dashboard — full-member count, After Hours card, lunch links

**Files:**
- Modify: `src/components/tabs/DashboardTab.tsx`

- [ ] **Step 1: Pull the new values from the hooks**

In `DashboardTab.tsx`, change the `useMembers()` and `useDashboardSettings()`
destructuring (currently lines 36 and 39):

```typescript
  const { members, chapterCounts, fullMemberCount, afterHoursCount } = useMembers();
```
```typescript
  const { targetMembers, chapterGoals, chapterLunchUrls, impactStats, updateMultiple } = useDashboardSettings();
```

- [ ] **Step 2: Use full-member count for the goal math**

Change the `currentMembers` line (currently line 47) to:

```typescript
  const currentMembers = fullMemberCount;
```

- [ ] **Step 3: Add the `UserCheck` icon to the imports**

In the lucide-react import block (lines 4-17), add `UserCheck,` to the list.

- [ ] **Step 4: Add an After Hours stat card**

Keep all four existing cards. Add a fifth card by inserting it immediately after
the closing `/>` of the `Approved This Year` StatCard (the last card in the grid,
ends ~line 173) and before the grid's closing `</div>`:

```tsx
        <StatCard
          title="After Hours Members"
          value={afterHoursCount}
          subtitle="Wait list — not in the 125 goal"
          icon={UserCheck}
          color="purple"
        />
```

The grid is responsive (`md:grid-cols-2 lg:grid-cols-4`), so a fifth card simply
wraps onto the next row. No existing card is removed.

- [ ] **Step 5: Render the lunch link inside each chapter card**

Find the chapter goals map (lines ~213-223). Replace the `ProgressBar` map with a
wrapper that adds the lunch link beneath each bar:

```tsx
          {(Object.entries(chapterGoals) as [ChapterName, number][]).map(
            ([chapter, target]) => (
              <div key={chapter} className="space-y-1.5">
                <ProgressBar
                  label={chapter === 'FLOC' ? 'FLOC (Future Leaders)' : `BLOC ${chapter}`}
                  current={chapterCounts[chapter] || 0}
                  target={target}
                  color={chapterColors[chapter]}
                />
                {chapterLunchUrls[chapter] && (
                  <LunchLink chapter={chapter} url={chapterLunchUrls[chapter]} />
                )}
              </div>
            )
          )}
```

- [ ] **Step 6: Import LunchLink**

In the `@/components/ui` import (line 18), add `LunchLink` to the destructured list:

```typescript
import { StatCard, ProgressBar, Card, CardTitle, Button, Modal, Input, LunchLink } from '@/components/ui';
```

- [ ] **Step 7: Verify type-check + build**

Run: `npx tsc --noEmit`
Expected: passes for `DashboardTab.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/tabs/DashboardTab.tsx
git commit -m "feat(dashboard): full-member count, After Hours card, chapter lunch links"
```

---

## Task 7: Members roster — After Hours filter + badge

**Files:**
- Modify: `src/components/tabs/MembersTab.tsx`

- [ ] **Step 1: Extend the filter type and dropdown list**

In `MembersTab.tsx`, change the `ChapterFilter` type (line 11) and the
`chapterFilters` array (lines 13-20):

```typescript
type ChapterFilter = ChapterName | 'all' | 'after_hours';

const chapterFilters: { value: ChapterFilter; label: string }[] = [
  { value: 'all', label: 'All Members' },
  { value: 'North', label: 'North' },
  { value: 'South', label: 'South' },
  { value: 'Uptown', label: 'Uptown' },
  { value: 'FLOC', label: 'FLOC' },
  { value: 'Alumni', label: 'Alumni' },
  { value: 'after_hours', label: 'After Hours' },
];
```

- [ ] **Step 2: Pull `afterHoursCount` from the hook**

Change the `useMembers()` destructuring (line 25) to include `afterHoursCount`:

```typescript
  const { members, chapterCounts, afterHoursCount, loading, error, addMember, updateMember, deleteMember } = useMembers();
```

- [ ] **Step 3: Update the filter logic**

In the `filteredMembers` `useMemo` (starts line 154), replace the chapter-filter
block:

```typescript
    if (chapterFilter === 'after_hours') {
      result = result.filter((m) => m.memberType === 'after_hours');
    } else if (chapterFilter !== 'all') {
      result = result.filter(
        (m) => m.memberType !== 'after_hours' && m.chapter === chapterFilter,
      );
    }
```

- [ ] **Step 4: Add the After Hours stat chip**

In the "Chapter Stats" grid (lines 240-265), change the grid to fit 6 chips and add
an After Hours chip after the chapter map. Change the wrapper className to
`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3`, then immediately after the
closing `)}` of the `chapterCounts` map (line 264) and before the closing `</div>`,
add:

```tsx
        <button
          onClick={() =>
            setChapterFilter(chapterFilter === 'after_hours' ? 'all' : 'after_hours')
          }
          className={`p-4 rounded-xl text-center transition-all ${
            chapterFilter === 'after_hours'
              ? 'bg-bloc-blue text-white shadow-lg scale-105'
              : 'bg-white border border-slate-200 hover:border-bloc-blue'
          }`}
        >
          <p className="text-2xl font-bold">{afterHoursCount}</p>
          <p
            className={`text-sm ${
              chapterFilter === 'after_hours' ? 'text-blue-100' : 'text-slate-500'
            }`}
          >
            After Hours
          </p>
        </button>
```

- [ ] **Step 5: Show the chapter cell / badge correctly for after_hours rows**

In the table row, find the cell that renders `member.chapter` (the Chapter column).
Replace its inner content with a badge-aware render:

```tsx
                  <td className="p-4">
                    {member.memberType === 'after_hours' ? (
                      <Badge color="purple">After Hours</Badge>
                    ) : (
                      member.chapter
                    )}
                  </td>
```

(If the existing chapter cell already wraps `member.chapter` in a `<Badge>`, keep
that styling for the non-after-hours branch.)

- [ ] **Step 6: Fix the results-count label**

Change the results-count paragraph (lines 302-305) to:

```tsx
      <p className="text-sm text-slate-500">
        Showing {filteredMembers.length} members
        {chapterFilter === 'after_hours'
          ? ' on the After Hours wait list'
          : chapterFilter !== 'all' && ` in ${chapterFilter}`}
      </p>
```

- [ ] **Step 7: Confirm `Badge` accepts a `color` prop**

Run: `grep -n "color\|Props\|interface" src/components/ui/Badge.tsx | head`
Expected: `Badge` takes a `color` prop including `'purple'`. If the prop name or
allowed values differ, adjust the Step 5 `<Badge>` usage to match.

- [ ] **Step 8: Verify type-check**

Run: `npx tsc --noEmit`
Expected: passes across the project (all earlier-task errors now resolved).

- [ ] **Step 9: Commit**

```bash
git add src/components/tabs/MembersTab.tsx
git commit -m "feat(roster): After Hours filter chip, dropdown option, and badge"
```

---

## Task 8: Import the 7 After Hours members + 3 pending applicants

**Depends on:** Task 1 applied to the live DB (the `member_type` column must exist).

**Files:**
- Create: `scripts/import_after_hours_and_pending.py`

- [ ] **Step 1: Write the import script**

Create `scripts/import_after_hours_and_pending.py`:

```python
#!/usr/bin/env python3
"""
One-time, idempotent import (deduped by email/name):
  - 7 After Hours Members -> members (member_type='after_hours', chapter=NULL)
  - 3 pending applicants  -> guests pipeline (status='Application Received')

Reads the 2026-05-27 member export from ~/Downloads. Requires
NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
Pass --dry-run to preview without writing.
"""
import os, sys, json, csv, urllib.request, urllib.error

DRY = '--dry-run' in sys.argv
ROOT = os.path.join(os.path.dirname(__file__), '..')
for line in open(os.path.join(ROOT, '.env.local')):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip())
URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
     'Content-Type': 'application/json', 'Prefer': 'return=representation'}

AFTER_HOURS = {'Brett Cohen', 'Amy Pierce', 'Lara Persing', 'Marc Wulf',
               'Jules Belfi', 'Aubrey Turner', 'Sharon Peterson'}
PENDING = {'Mark Weinberg', 'Ebony Jackson', 'Lara Murphy'}

DL = os.path.expanduser('~/Downloads/2026-05-27 Members Business Leaders of Charlotte.csv')

def get(path):
    r = urllib.request.Request(URL + '/rest/v1/' + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.loads(urllib.request.urlopen(r).read())

def post(table, rows):
    if not rows:
        return True, []
    if DRY:
        print(f"[dry-run] would POST {len(rows)} -> {table}: {json.dumps(rows, indent=2)}")
        return True, rows
    req = urllib.request.Request(URL + '/rest/v1/' + table, data=json.dumps(rows).encode(), headers=H, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return True, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return False, e.read().decode()

def norm(s): return (s or '').strip().lower()

rows = list(csv.DictReader(open(DL, encoding='utf-8-sig')))
db_m = get('members?select=name,email&limit=2000')
db_g = get('guests?select=name,email&limit=2000')
me = {norm(x['email']) for x in db_m if x.get('email')}; mn = {norm(x['name']) for x in db_m}
ge = {norm(x['email']) for x in db_g if x.get('email')}; gn = {norm(x['name']) for x in db_g}

members_ins, guests_ins = [], []
for r in rows:
    name = (r['First name'] + ' ' + r['Last name']).strip()
    email = (r.get('Email') or '').strip()
    industry = (r.get('Industry') or r.get('Specific Industry description') or '').strip()
    phone = (r.get('Phone') or '').strip()
    if name in AFTER_HOURS:
        if norm(email) in me or norm(name) in mn:
            continue
        members_ins.append({'name': name, 'company': (r.get('Business Name') or '').strip(),
                            'chapter': None, 'member_type': 'after_hours',
                            'industry': industry, 'email': email or None, 'phone': phone or None})
    elif name in PENDING:
        if norm(email) in ge or norm(name) in gn:
            continue
        ref = (r.get('Referring Member 1') or '').strip()
        guests_ins.append({'name': name, 'company': (r.get('Business Name') or '').strip(),
                          'industry': industry or None,
                          'invited_by': ref or 'Membership application',
                          'email': email or None, 'phone': phone or None,
                          'status': 'Application Received',
                          'next_step': 'Follow up to complete membership',
                          'notes': 'Pending-New in WA export as of 2026-05-27.',
                          'target_chapter': None})

print(f"After Hours members to add: {len(members_ins)}; pending applicants to add: {len(guests_ins)}")
ok1, res1 = post('members', members_ins)
print('members:', 'OK' if ok1 else 'FAIL', '->', (f"{len(res1)} rows" if ok1 else res1))
ok2, res2 = post('guests', guests_ins)
print('guests: ', 'OK' if ok2 else 'FAIL', '->', (f"{len(res2)} rows" if ok2 else res2))
```

- [ ] **Step 2: Dry-run to preview**

Run:
```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard" && python3 scripts/import_after_hours_and_pending.py --dry-run
```
Expected: "After Hours members to add: 7; pending applicants to add: 3" and a JSON
preview of each row. (If a name was already imported, its count drops — that is the
dedupe working.)

- [ ] **Step 3: Run the import for real**

Run:
```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard" && python3 scripts/import_after_hours_and_pending.py
```
Expected: `members: OK -> 7 rows` and `guests: OK -> 3 rows`.

- [ ] **Step 4: Verify in the DB**

Run:
```bash
cd "/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard" && python3 - <<'PY'
import os,urllib.request,json
for line in open('.env.local'):
    line=line.strip()
    if line and not line.startswith('#') and '=' in line:
        k,v=line.split('=',1);os.environ.setdefault(k.strip(),v.strip())
URL=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/');KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']
def g(p):
    r=urllib.request.Request(URL+'/rest/v1/'+p,headers={'apikey':KEY,'Authorization':'Bearer '+KEY})
    return json.loads(urllib.request.urlopen(r).read())
print("after_hours members:", [m['name'] for m in g("members?select=name&member_type=eq.after_hours")])
print("Application Received guests:", [g_['name'] for g_ in g("guests?select=name&status=eq.Application%20Received")])
PY
```
Expected: the 7 After Hours names and the 3 pending names print.

- [ ] **Step 5: Commit**

```bash
git add scripts/import_after_hours_and_pending.py
git commit -m "chore(import): add 7 After Hours members + 3 pending applicants"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (including `summary.test.ts` and `share.test.ts`).

- [ ] **Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Manual smoke (dev server)**

Run: `npm run dev`, sign in, and confirm:
- Dashboard total members excludes the 7 After Hours members; an "After Hours
  Members" card shows `7`; each chapter card shows a "Register for lunch" link with
  working Share and QR.
- Members roster has an "After Hours" chip showing `7`, filters correctly, and those
  rows show an "After Hours" badge instead of a chapter.

---

## Self-Review notes

- **Spec coverage:** schema (Task 1), types (Task 2), counting/stats (Task 3),
  lunch settings (Task 4), share+QR (Task 5), dashboard UI (Task 6), roster UI
  (Task 7), data import (Task 8). All spec sections map to a task.
- **Roster representation:** the spec mentioned an "After Hours heading"; the actual
  roster is a flat, filter-chip + badge table, so this plan implements the tier as a
  filter chip + badge (faithful to the "roster + own filter/badge" decision).
- **Toast/Badge APIs:** Steps 7 (Task 5) and 7 (Task 7) verify the real `useToast`
  and `Badge` signatures before relying on them, since those weren't pinned during
  planning.
