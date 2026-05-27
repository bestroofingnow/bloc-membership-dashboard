# After Hours Member Tier, Pending Applicants & Chapter Lunch Links

**Date:** 2026-05-27
**Status:** Approved
**Author:** James Turner (with Claude)

## Background

The BLOC dashboard models members as belonging to one of five chapters
(`North`, `South`, `Uptown`, `FLOC`, `Alumni`). The `members.chapter` column is
required, and the `ChapterName` union type is referenced across ~20 files
(events, guest targeting, QR tokens, chapter visibility, roster, dashboard).

Two member situations are not currently representable:

1. **After Hours Members** — a new membership tier. These people attend
   after-hours (BLOCtail) events but are **not** full chapter members. They are
   effectively a wait list for a chapter seat to open up or a new chapter to
   start. They have **no chapter** yet.

2. **Pending applicants** — people who have started but not completed joining
   ("Pending - New" in the Wild Apricot export). They are not yet members.

Separately, each chapter runs a recurring lunch with its own Wild Apricot
registration page. The dashboard should link to each chapter's lunch
registration page.

This work was triggered by importing the 2026-05-27 member export: 10 of the 20
members missing from the roster had no chapter in the export — 7 are After Hours
Members (Active, no chapter) and 3 are pending applicants.

## Goals

- Represent After Hours Members as a distinct member tier with no chapter.
- Track pending applicants in the recruitment pipeline.
- Surface a per-chapter lunch registration link on the dashboard.
- Do **not** distort the 125 full-member goal or per-chapter targets.
- Avoid polluting the shared `ChapterName` type used by unrelated features.

## Non-Goals

- No change to how full members, chapters, or chapter goals work today.
- No event check-in / formal event-registration linkage (tracked separately).
- No automatic Wild Apricot sync of the After Hours tier (manual/import for now).

## Design

### 1. Schema changes (`members` table)

New migration `016_after_hours_member_tier.sql`:

- Add `member_type TEXT NOT NULL DEFAULT 'full'`
  with `CHECK (member_type IN ('full', 'after_hours'))`.
- Make `chapter` **nullable** and relax the CHECK so it allows `NULL`
  (otherwise still one of the 5 chapter values):
  `CHECK (chapter IS NULL OR chapter IN ('North','South','Uptown','FLOC','Alumni'))`.

After Hours Members are stored as `member_type = 'after_hours'`, `chapter = NULL`.
Full members are `member_type = 'full'` with a non-null chapter (existing rows
default to `'full'` via the column default).

The lunch registration URLs are stored in the existing `dashboard_settings`
key/value table (no schema change) under keys:
`lunch_url_south`, `lunch_url_floc`, `lunch_url_uptown`, `lunch_url_north`.
The same migration seeds the three confirmed URLs (North is added once its
correct URL is supplied — see Open Items).

### 2. Type changes (`src/types/index.ts`)

- `Member.chapter` → `ChapterName | null`.
- Add `Member.memberType: 'full' | 'after_hours'`.
- `ChapterName` is unchanged (stays the 5 values). Events, guest `target_chapter`,
  QR tokens, and chapter-visibility are therefore unaffected.

`useMembers.transformDbToMember` maps `row.member_type` → `memberType` and passes
`row.chapter` through as `null` when absent. Insert/update paths in `useMembers`
include `member_type` and allow a null `chapter`.

### 3. Counting / stats behavior

- The 125-goal total and `chapterCounts` count **only** `member_type === 'full'`.
  - Null-chapter members already fall out of the per-chapter buckets in
    `membersByChapter`; additionally exclude `after_hours` from the overall total.
- Add an `afterHoursCount` (count of `member_type === 'after_hours'`) exposed
  from `useMembers` for display.

### 4. UI — After Hours Members

- **Member Roster (`MembersTab`):**
  - After Hours Members render with an "After Hours" badge.
  - A filter toggle shows only After Hours Members.
  - In the chapter-grouped view, null-chapter members are grouped under an
    "After Hours" heading at the bottom of the roster.
- **Dashboard (`DashboardTab`):**
  - A small "After Hours Members" count card, visually separate from the 125
    progress and chapter-goal section.

### 5. UI — Chapter lunch registration links

- Per-chapter URLs live in `dashboard_settings` (see §1), exposed through
  `useDashboardSettings` alongside the existing goal keys.
- Each chapter card in the Dashboard "Chapter Membership Goals" section renders a
  **"Register for lunch →"** link **only when that chapter's URL is set**.
  A chapter with no configured URL shows no link (data-driven, no hardcoded URLs,
  admin-editable later via the same settings mechanism).

Confirmed URLs to seed:

| Chapter | Registration URL |
|---------|------------------|
| South   | https://businessleadersofcharlotte.com/event-6651645/Registration |
| FLOC    | https://businessleadersofcharlotte.com/event-6484425/Registration |
| Uptown  | https://businessleadersofcharlotte.com/event-6484396/Registration |
| North   | _pending correct URL — see Open Items_ |

### 6. Data import (run after the schema migration is applied)

These are one-time data operations against the live DB, deduped by email/name:

- **7 After Hours Members** → insert into `members` with
  `member_type = 'after_hours'`, `chapter = NULL`, industry/email/phone from the
  export: Brett Cohen, Amy Pierce, Lara Persing, Marc Wulf, Jules Belfi,
  Aubrey Turner, Sharon Peterson.
- **3 pending applicants** → insert into `guests` (pipeline) at
  `status = 'Application Received'`, `invited_by` from "Referring Member 1" or a
  sensible default, `next_step` set: Mark Weinberg, Ebony Jackson, Lara Murphy.

(Context: the 10 chapter-assigned members and 21 tonight's BLOCtail guests were
already imported in the preceding step. This phase only adds the 7 + 3 above.)

## Data model summary

| Concept | Storage | Counts toward 125? | Has chapter? |
|---------|---------|--------------------|--------------|
| Full member | `members`, `member_type='full'` | Yes | Yes (1 of 5) |
| After Hours Member | `members`, `member_type='after_hours'` | No | No (NULL) |
| Pending applicant | `guests`, `status='Application Received'` | No | n/a (`target_chapter` optional) |

## Migration / rollback

- Forward: additive column + relaxed CHECK + seeded settings rows. Existing rows
  get `member_type='full'` via the default; no data backfill required.
- Rollback: drop the `member_type` column and restore the stricter `chapter`
  CHECK (only safe if no `after_hours` rows / null chapters exist).

## Testing

- Schema: applying `016` succeeds; existing members read back as `full`.
- Stats: inserting an `after_hours` member does **not** change the 125 total or
  any chapter count; `afterHoursCount` increments.
- Roster: after-hours members show the badge, appear under the filter, and group
  under "After Hours"; full members are unaffected.
- Dashboard: chapter cards show a lunch link only for chapters with a URL set;
  North shows none until its URL is added.
- Import: re-running the import is idempotent (dedupes by email/name).

## Open Items

- **North lunch registration URL** — the value originally supplied duplicated
  Uptown's (`event-6484396`). North's card will show no lunch link until the
  correct URL is provided and added to `dashboard_settings.lunch_url_north`.
