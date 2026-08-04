# Networking Activity Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-person-only meeting tables with a group-capable `meetings`/`meeting_participants` model, add a `connections` entity (people met but not yet referred, which can source multiple later referrals), surface referrals/meetings/connections activity on the admin dashboard for the first time, add a member-facing leaderboard, and gate the whole feature behind a single org-wide toggle.

**Architecture:** Two Supabase migrations add the new tables/views on top of the existing `members`/`referrals` schema; three pure-function lib modules (ported identically between the dashboard and mobile repos, per this codebase's existing "tested source of truth + ported copy" convention) drive validation/bucketing; Supabase-direct hooks (matching every existing hook in both repos — no separate backend API) do the CRUD; the admin tab and mobile screens are net-new UI following each repo's established component patterns.

**Tech Stack:** Next.js 16 (dashboard), Expo/React Native (mobile), Supabase (Postgres + RLS + Realtime), Vitest.

## Global Constraints

- Every new/changed pure-function module gets colocated `.test.ts` tests (Vitest), matching the density and style of `src/lib/meetings/invite.test.ts` and `src/lib/connections/oneToOne.test.ts` — no UI/component tests exist anywhere in either repo today; don't introduce that layer.
- Lib modules under `src/lib/` are duplicated (not symlinked/packaged) between the dashboard and mobile repos. The dashboard copy is the "tested source of truth" (existing convention, see the header comments in the mobile copies); port dashboard changes to mobile by hand, keeping mobile's existing "Ported from the web repo's..." comment style.
- All new tables get RLS enabled, following the exact `current_member_id()` / `is_staff()` helper pattern already defined in migration `032_referrals.sql` — do not redefine those functions, just reuse them (`CREATE OR REPLACE FUNCTION` is idempotent if a task needs to touch them, but no task here does).
- `meetings.kind` stays the existing enum (`coffee|lunch|virtual`) — meeting size (1-on-1 vs. group) is derived from participant count, never stored as a separate flag.
- The org-wide toggle is a `dashboard_settings` row (`key='networking_enabled'`) — reuse the existing generic `useDashboardSettings()` hook on the dashboard side; do not create a new settings table or a new admin-write API route.
- No per-member opt-out, no admin editing of individual meetings/connections/referrals (dashboard is aggregate-counts-only), no change to `asks_offers`/`testimonials`/event attendance.

---

## Part A — Dashboard: schema migrations

### Task 1: `meetings` + `meeting_participants` tables, migrated from the legacy pairwise tables

**Files:**
- Create: `supabase/migrations/046_meetings_unified.sql`

**Interfaces:**
- Produces: table `public.meetings` (`id`, `organizer_member_id`, `kind`, `status` (`proposed|completed|cancelled`), `proposed_at`, `met_on`, `location`, `note`, `created_at`, `updated_at`) and `public.meeting_participants` (`meeting_id`, `member_id`, `response_status` (`pending|accepted|declined`), PK `(meeting_id, member_id)`) — later tasks (5, 10, 12) read/write these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 046: Unified meetings (replaces meeting_invites + one_to_ones)
-- A meeting has any number of participants (2 = a "1-on-1", 3+ = a group
-- meeting — size is derived, never stored). Two ways to create one: propose
-- ahead of time (status='proposed', organizer's row 'accepted', everyone
-- else 'pending') or log something that already happened (status=
-- 'completed', met_on set, everyone 'accepted' immediately). Only the
-- organizer may cancel. One participant declining does not cancel the
-- meeting for everyone else. Mirrors src/lib/meetings/invite.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meetings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('coffee','lunch','virtual')),
  status               text NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed','completed','cancelled')),
  proposed_at          timestamptz,
  met_on               date,
  location             text,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (proposed_at IS NOT NULL OR met_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS meetings_organizer_idx ON public.meetings(organizer_member_id);

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  meeting_id       uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  response_status  text NOT NULL DEFAULT 'pending'
                     CHECK (response_status IN ('pending','accepted','declined')),
  PRIMARY KEY (meeting_id, member_id)
);
CREATE INDEX IF NOT EXISTS meeting_participants_member_idx ON public.meeting_participants(member_id);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Visible to any participant (or staff).
DROP POLICY IF EXISTS meetings_read ON public.meetings;
CREATE POLICY meetings_read ON public.meetings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.meeting_participants p
            WHERE p.meeting_id = meetings.id AND p.member_id = public.current_member_id())
    OR public.is_staff()
  );
-- You may only create a meeting you're organizing.
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (organizer_member_id = public.current_member_id());
-- Only the organizer updates the meeting row itself (cancel/complete).
DROP POLICY IF EXISTS meetings_update ON public.meetings;
CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated
  USING (organizer_member_id = public.current_member_id())
  WITH CHECK (organizer_member_id = public.current_member_id());

DROP POLICY IF EXISTS meeting_participants_read ON public.meeting_participants;
CREATE POLICY meeting_participants_read ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.meeting_participants p2
            WHERE p2.meeting_id = meeting_participants.meeting_id AND p2.member_id = public.current_member_id())
    OR public.is_staff()
  );
-- The organizer inserts all participant rows (including their own) when creating a meeting.
DROP POLICY IF EXISTS meeting_participants_insert ON public.meeting_participants;
CREATE POLICY meeting_participants_insert ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND m.organizer_member_id = public.current_member_id())
  );
-- A participant may only update their own response.
DROP POLICY IF EXISTS meeting_participants_update ON public.meeting_participants;
CREATE POLICY meeting_participants_update ON public.meeting_participants FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='meetings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='meeting_participants') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants';
  END IF;
END $$;

-- ---------- backfill from the legacy pairwise tables ----------
-- meeting_invites -> meetings (+ 2 participant rows each)
INSERT INTO public.meetings (id, organizer_member_id, kind, status, proposed_at, created_at, updated_at, location, note)
SELECT id, proposed_by_member_id, kind,
       CASE status WHEN 'cancelled' THEN 'cancelled' WHEN 'completed' THEN 'completed' ELSE 'proposed' END,
       proposed_at, created_at, updated_at, location, note
FROM public.meeting_invites
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT id, from_member_id,
       CASE WHEN status IN ('accepted','completed') THEN 'accepted'
            WHEN status = 'declined' THEN 'declined' ELSE 'pending' END
FROM public.meeting_invites
ON CONFLICT (meeting_id, member_id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT id, to_member_id,
       CASE WHEN status IN ('accepted','completed') THEN 'accepted'
            WHEN status = 'declined' THEN 'declined' ELSE 'pending' END
FROM public.meeting_invites
ON CONFLICT (meeting_id, member_id) DO NOTHING;

-- one_to_ones -> meetings (+ 2 participant rows each), skipping any pair+date
-- already migrated above via a completed invite (avoids double-counting the
-- "Logged as a 1-to-1" conversion path, which has no direct FK back to the
-- invite it came from).
INSERT INTO public.meetings (id, organizer_member_id, kind, status, met_on, created_at, updated_at, note)
SELECT o.id, o.member_id, 'coffee', 'completed', o.met_on, o.created_at, o.created_at, o.notes
FROM public.one_to_ones o
WHERE NOT EXISTS (
  SELECT 1 FROM public.meetings m
  JOIN public.meeting_participants p1 ON p1.meeting_id = m.id AND p1.member_id = o.member_id
  JOIN public.meeting_participants p2 ON p2.meeting_id = m.id AND p2.member_id = o.with_member_id
  WHERE m.status = 'completed' AND m.met_on = o.met_on
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT o.id, o.member_id, 'accepted'
FROM public.one_to_ones o
WHERE EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = o.id)
ON CONFLICT (meeting_id, member_id) DO NOTHING;

INSERT INTO public.meeting_participants (meeting_id, member_id, response_status)
SELECT o.id, o.with_member_id, 'accepted'
FROM public.one_to_ones o
WHERE EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = o.id)
ON CONFLICT (meeting_id, member_id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration and verify row counts reconcile**

Run against the Supabase project (via the SQL editor or `SUPABASE_SERVICE_ROLE_KEY` + `psql`/REST, same approach used earlier this session for direct DB access — see the service-role key in `.env.local`):

```sql
select
  (select count(*) from meeting_invites) as legacy_invites,
  (select count(*) from one_to_ones) as legacy_logs,
  (select count(*) from meetings) as new_meetings,
  (select count(*) from meeting_participants) as new_participants;
```

Expected: `new_meetings` is between `legacy_invites` and `legacy_invites + legacy_logs` (some `one_to_ones` rows are de-duplicated against their originating invite); `new_participants` is `2 * new_meetings` exactly (every meeting has exactly 2 rows at this point, since nothing group-sized exists yet — that only starts once Part F ships). If `new_participants` isn't exactly double `new_meetings`, stop and inspect before continuing — do not proceed to Task 4 (dropping the legacy tables) until this reconciles.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/046_meetings_unified.sql
git commit -m "feat(db): unified meetings table supporting group participants (migration 046)"
```

---

### Task 2: `connections` table + `referrals.source_connection_id`

**Files:**
- Create: `supabase/migrations/047_connections.sql`

**Interfaces:**
- Consumes: `public.referrals` (from migration 032) — this task only adds a column to it.
- Produces: table `public.connections` (`id`, `member_id`, `contact_name`, `company`, `email`, `phone`, `notes`, `status` (`active|archived`), `created_at`, `updated_at`); `public.referrals.source_connection_id` (nullable FK → `connections.id`) — later tasks (6, 11, 13, 14) use these exact names.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 047: Connections (people met, not yet ready to refer)
-- A member logs a connection; it may later source one or more referrals
-- (referrals.source_connection_id, many-to-one — one connection can produce
-- several referrals over time). Archiving a connection does not affect
-- referrals already linked to it (ON DELETE SET NULL, not CASCADE).
-- Same RLS shape as referrals: owned by member_id, readable/writable only
-- by that member (+ staff).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  contact_name  text NOT NULL,
  company       text,
  email         text,
  phone         text,
  notes         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connections_member_idx ON public.connections(member_id);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connections_read ON public.connections;
CREATE POLICY connections_read ON public.connections FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.is_staff());
DROP POLICY IF EXISTS connections_insert ON public.connections;
CREATE POLICY connections_insert ON public.connections FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
DROP POLICY IF EXISTS connections_update ON public.connections;
CREATE POLICY connections_update ON public.connections FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='connections') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.connections';
  END IF;
END $$;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS source_connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase SQL editor (or service-role REST), then verify: `SELECT column_name FROM information_schema.columns WHERE table_name='referrals' AND column_name='source_connection_id';` returns one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/047_connections.sql
git commit -m "feat(db): connections table + referrals.source_connection_id (migration 047)"
```

---

### Task 3: Stats views + org-wide toggle setting

**Files:**
- Create: `supabase/migrations/048_networking_stats_and_toggle.sql`

**Interfaces:**
- Consumes: `meeting_participants` (Task 1), `connections`/`referrals.source_connection_id` (Task 2), `dashboard_settings` (existing, migration 007).
- Produces: views `public.v_meeting_stats` (`member_id`, `meetings_count`), `public.v_connection_stats` (`member_id`, `connections_count`, `converted_count`) — Task 7 (dashboard hook) and Task 15 (mobile hook) query these by name. Seeds `dashboard_settings` row `key='networking_enabled', value='true'` — Task 8, 22, 24 read/write this key.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 048: Networking stats views + org-wide feature toggle
-- Aggregate-only views (counts, no raw content) — same privacy posture as
-- the existing v_referral_stats (migration 032). Power both the mobile
-- Tracker screen and the dashboard admin Networking tab.
-- ============================================================

CREATE OR REPLACE VIEW public.v_meeting_stats AS
  SELECT member_id, count(*) AS meetings_count
  FROM public.meeting_participants
  WHERE response_status = 'accepted'
  GROUP BY member_id;
GRANT SELECT ON public.v_meeting_stats TO authenticated;

CREATE OR REPLACE VIEW public.v_connection_stats AS
  SELECT c.member_id,
         count(*) AS connections_count,
         count(r.id) AS converted_count
  FROM public.connections c
  LEFT JOIN public.referrals r ON r.source_connection_id = c.id
  GROUP BY c.member_id;
GRANT SELECT ON public.v_connection_stats TO authenticated;

INSERT INTO dashboard_settings (key, value) VALUES ('networking_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply and verify**

`SELECT * FROM v_meeting_stats LIMIT 1;` and `SELECT * FROM v_connection_stats LIMIT 1;` should run without error (empty result is fine — no connections exist yet). `SELECT value FROM dashboard_settings WHERE key='networking_enabled';` should return `'true'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_networking_stats_and_toggle.sql
git commit -m "feat(db): meeting/connection stats views + networking_enabled toggle (migration 048)"
```

---

### Task 4: Drop the legacy pairwise tables (run only after Part F ships and is verified live)

**Files:**
- Create: `supabase/migrations/049_drop_legacy_meeting_tables.sql`

**Interfaces:**
- Consumes: confirmation that no code in either repo still queries `meeting_invites` or `one_to_ones` (Tasks 12 and 17 remove the last references).

- [ ] **Step 1: Write the migration** (do not apply yet — see Step 2)

```sql
-- ============================================================
-- Migration 049: Drop legacy pairwise meeting tables
-- Only apply after confirming (a) migration 046's backfill reconciled
-- (Task 1, Step 2) and (b) no app code references meeting_invites or
-- one_to_ones anymore (Tasks 12, 17).
-- ============================================================
DROP TABLE IF EXISTS public.meeting_invites;
DROP TABLE IF EXISTS public.one_to_ones;
```

- [ ] **Step 2: Apply manually once Part F (mobile UI) is deployed and confirmed working**

This is a deliberate manual gate, not an automated step — do not run this migration as part of the initial rollout. After the mobile app update ships and someone has exercised propose/log/respond/cancel on a real meeting, grep both repos for `meeting_invites` and `one_to_ones` to confirm zero remaining references, then apply this migration.

- [ ] **Step 3: Commit** (commit the file now even though you won't apply it yet, so it's in version control)

```bash
git add supabase/migrations/049_drop_legacy_meeting_tables.sql
git commit -m "chore(db): add (unapplied) migration to drop legacy meeting tables once verified"
```

---

## Part B — Dashboard: shared lib logic

### Task 5: Generalize `src/lib/meetings/invite.ts` from pairwise to N participants

**Files:**
- Modify: `src/lib/meetings/invite.ts`
- Modify: `src/lib/meetings/invite.test.ts`

**Interfaces:**
- Produces: `MEETING_KINDS`, `MeetingKind`, `MEETING_KIND_LABEL` (unchanged), `MeetingStatus = 'proposed'|'completed'|'cancelled'`, `ParticipantStatus = 'pending'|'accepted'|'declined'`, `Meeting` type, `Participant` type, `validateMeeting(input): ValidationResult`, `myParticipantStatus(meeting, myId): ParticipantStatus | null`, `canCancel(meeting, myId): boolean`, `categorizeMeetings<T>(meetings, myId, now?): CategorizedMeetings<T>` with buckets `needsMyResponse/awaitingOthers/upcoming/past`. Tasks 10 (mobile port), 12 (mobile hook), 17 (mobile UI) consume these exact names.
- This REPLACES `validateInvite`, `awaitingMemberId`, `canRespond`, `counterpartId`, `categorizeInvites` — those pairwise-only functions and their tests are removed in this task, not kept alongside the new ones.

- [ ] **Step 1: Write the failing tests** (replace the full contents of `invite.test.ts`)

```typescript
import { describe, test, expect } from 'vitest';
import {
  validateMeeting,
  myParticipantStatus,
  canCancel,
  categorizeMeetings,
  type Meeting,
  type Participant,
} from './invite';

function participant(memberId: string, status: Participant['response_status'] = 'pending'): Participant {
  return { member_id: memberId, response_status: status };
}

function meeting(p: Partial<Meeting> & { participants: Participant[] }): Meeting {
  return {
    id: 'm',
    organizer_member_id: 'a',
    kind: 'coffee',
    status: 'proposed',
    proposed_at: '2026-07-01T14:00:00Z',
    met_on: null,
    location: null,
    note: null,
    ...p,
  };
}

describe('validateMeeting()', () => {
  const ok = {
    organizerId: 'a',
    participantIds: ['b', 'c'],
    kind: 'coffee',
    proposedAt: '2026-07-01T14:00:00Z',
  };
  test('a complete proposal is valid', () => {
    expect(validateMeeting(ok).ok).toBe(true);
  });
  test('requires an organizer and at least one other participant', () => {
    expect(validateMeeting({ ...ok, organizerId: '' }).ok).toBe(false);
    expect(validateMeeting({ ...ok, participantIds: [] }).ok).toBe(false);
  });
  test('the organizer cannot also be listed as a participant', () => {
    expect(validateMeeting({ ...ok, participantIds: ['a', 'b'] }).ok).toBe(false);
  });
  test('rejects duplicate participants', () => {
    expect(validateMeeting({ ...ok, participantIds: ['b', 'b'] }).ok).toBe(false);
  });
  test('rejects a bad kind', () => {
    expect(validateMeeting({ ...ok, kind: 'dinner' }).ok).toBe(false);
  });
  test('when logging a past meeting (metOn set), proposedAt is not required', () => {
    expect(validateMeeting({ ...ok, proposedAt: null, metOn: '2026-06-01' }).ok).toBe(true);
  });
  test('requires either proposedAt or metOn', () => {
    expect(validateMeeting({ ...ok, proposedAt: null, metOn: null }).ok).toBe(false);
  });
  test('caps location length', () => {
    expect(validateMeeting({ ...ok, location: 'x'.repeat(301) }).ok).toBe(false);
  });
});

describe('myParticipantStatus()', () => {
  test("returns the caller's own response status", () => {
    const m = meeting({ participants: [participant('a', 'accepted'), participant('b', 'pending')] });
    expect(myParticipantStatus(m, 'a')).toBe('accepted');
    expect(myParticipantStatus(m, 'b')).toBe('pending');
  });
  test('null when the caller is not a participant', () => {
    const m = meeting({ participants: [participant('a', 'accepted')] });
    expect(myParticipantStatus(m, 'z')).toBeNull();
  });
});

describe('canCancel()', () => {
  test('only the organizer can cancel', () => {
    const m = meeting({ organizer_member_id: 'a', participants: [participant('a', 'accepted'), participant('b', 'accepted')] });
    expect(canCancel(m, 'a')).toBe(true);
    expect(canCancel(m, 'b')).toBe(false);
  });
});

describe('categorizeMeetings()', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  const data: Meeting[] = [
    meeting({ id: 'm1', participants: [participant('a', 'accepted'), participant('me', 'pending')] }), // needs my response
    meeting({ id: 'm2', participants: [participant('me', 'accepted'), participant('b', 'pending')] }), // awaiting others
    meeting({ id: 'm3', proposed_at: '2026-07-05T14:00:00Z', participants: [participant('me', 'accepted'), participant('c', 'accepted')] }), // upcoming
    meeting({ id: 'm4', proposed_at: '2026-06-20T14:00:00Z', participants: [participant('me', 'accepted'), participant('d', 'accepted')] }), // past (elapsed)
    meeting({ id: 'm5', status: 'completed', met_on: '2026-06-10', proposed_at: null, participants: [participant('me', 'accepted'), participant('e', 'accepted')] }), // past (logged)
    meeting({ id: 'm6', status: 'cancelled', participants: [participant('me', 'pending')] }), // dropped
    meeting({ id: 'm7', participants: [participant('other1', 'pending'), participant('other2', 'accepted')] }), // I'm not in this one
  ];
  const c = categorizeMeetings(data, 'me', now);

  test('needs-my-response: proposed, my status still pending', () => {
    expect(c.needsMyResponse.map((m) => m.id)).toEqual(['m1']);
  });
  test('awaiting-others: proposed, I accepted, someone else still pending', () => {
    expect(c.awaitingOthers.map((m) => m.id)).toEqual(['m2']);
  });
  test('upcoming: proposed, everyone accepted, in the future', () => {
    expect(c.upcoming.map((m) => m.id)).toEqual(['m3']);
  });
  test('past: elapsed accepted meetings and completed logs, most-recent-first', () => {
    expect(c.past.map((m) => m.id)).toEqual(['m4', 'm5']);
  });
  test('drops cancelled and meetings the caller is not part of', () => {
    const ids = [...c.needsMyResponse, ...c.awaitingOthers, ...c.upcoming, ...c.past].map((m) => m.id);
    expect(ids).not.toContain('m6');
    expect(ids).not.toContain('m7');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/meetings/invite.test.ts`
Expected: FAIL — `validateMeeting`, `myParticipantStatus`, `canCancel`, `categorizeMeetings` are not exported yet.

- [ ] **Step 3: Write the implementation** (replace the full contents of `invite.ts`)

```typescript
export const MEETING_KINDS = ['coffee', 'lunch', 'virtual'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  coffee: 'Coffee',
  lunch: 'Lunch',
  virtual: 'Virtual',
};

export type MeetingStatus = 'proposed' | 'completed' | 'cancelled';
export type ParticipantStatus = 'pending' | 'accepted' | 'declined';

export interface Participant {
  member_id: string;
  response_status: ParticipantStatus;
}

export interface Meeting {
  id: string;
  organizer_member_id: string;
  kind: MeetingKind;
  status: MeetingStatus;
  proposed_at: string | null; // ISO timestamp; set when scheduled ahead
  met_on: string | null; // date; set when logged as already-happened
  location: string | null;
  note: string | null;
  participants: Participant[];
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface MeetingInput {
  organizerId: string;
  participantIds: string[]; // everyone EXCEPT the organizer
  kind: string;
  proposedAt?: string | null;
  metOn?: string | null;
  location?: string | null;
}

/**
 * Validate a new meeting (proposed ahead of time, or logged after the fact).
 * organizer + 1+ distinct non-organizer participants required, kind in the
 * set, location capped, and either proposedAt (schedule) or metOn (log) must
 * be present. Pure → unit-tested + shared (web/mobile).
 */
export function validateMeeting(input: MeetingInput): ValidationResult {
  if (!input.organizerId) return { ok: false, error: 'Missing organizer.' };
  if (!input.participantIds || input.participantIds.length === 0) {
    return { ok: false, error: 'Pick at least one other person.' };
  }
  if (input.participantIds.includes(input.organizerId)) {
    return { ok: false, error: "The organizer can't also be a participant." };
  }
  if (new Set(input.participantIds).size !== input.participantIds.length) {
    return { ok: false, error: 'That person is already in this meeting.' };
  }
  if (!MEETING_KINDS.includes(input.kind as MeetingKind)) {
    return { ok: false, error: 'Pick a meeting type.' };
  }
  const proposedAt = input.proposedAt ?? null;
  const metOn = input.metOn ?? null;
  if (!proposedAt && !metOn) return { ok: false, error: 'Pick a date and time.' };
  if (proposedAt && Number.isNaN(Date.parse(proposedAt))) {
    return { ok: false, error: 'Pick a date and time.' };
  }
  if ((input.location ?? '').length > 300) return { ok: false, error: 'Location is too long.' };
  return { ok: true };
}

/** The caller's own response status, or null if they're not a participant. */
export function myParticipantStatus(meeting: Meeting, myId: string): ParticipantStatus | null {
  return meeting.participants.find((p) => p.member_id === myId)?.response_status ?? null;
}

/** Only the organizer may cancel a meeting. */
export function canCancel(meeting: Pick<Meeting, 'organizer_member_id'>, myId: string): boolean {
  return meeting.organizer_member_id === myId;
}

/** Everyone has accepted (declines don't block "confirmed" — they're just not attending). */
function allOthersAccepted(meeting: Meeting, myId: string): boolean {
  return meeting.participants
    .filter((p) => p.member_id !== myId)
    .every((p) => p.response_status !== 'pending');
}

export interface CategorizedMeetings<T> {
  needsMyResponse: T[]; // proposed, my status still pending
  awaitingOthers: T[]; // proposed, I've accepted, someone else hasn't responded
  upcoming: T[]; // proposed, everyone's responded, in the future
  past: T[]; // elapsed, or completed
}

/**
 * Bucket a member's meetings for the UI. Cancelled meetings and meetings the
 * caller isn't part of are dropped. Upcoming is sorted soonest-first; past
 * most-recent-first.
 */
export function categorizeMeetings<T extends Meeting>(
  meetings: T[],
  myId: string,
  now: Date = new Date(),
): CategorizedMeetings<T> {
  const t = now.getTime();
  const out: CategorizedMeetings<T> = { needsMyResponse: [], awaitingOthers: [], upcoming: [], past: [] };
  for (const m of meetings) {
    if (m.status === 'cancelled') continue;
    const mine = myParticipantStatus(m, myId);
    if (mine === null) continue;
    if (m.status === 'completed') {
      out.past.push(m);
      continue;
    }
    // status === 'proposed'
    if (mine === 'pending') {
      out.needsMyResponse.push(m);
    } else if (!allOthersAccepted(m, myId)) {
      out.awaitingOthers.push(m);
    } else if (m.proposed_at && Date.parse(m.proposed_at) >= t) {
      out.upcoming.push(m);
    } else {
      out.past.push(m);
    }
  }
  const at = (m: T) => Date.parse(m.proposed_at ?? m.met_on ?? '');
  out.upcoming.sort((a, b) => at(a) - at(b));
  out.past.sort((a, b) => at(b) - at(a));
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/meetings/invite.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Search for and fix any other dashboard code importing the removed pairwise exports**

Run: `grep -rn "validateInvite\|awaitingMemberId\|canRespond\|counterpartId\|categorizeInvites" src --include="*.ts" --include="*.tsx"`
Expected: no results outside `invite.ts`/`invite.test.ts` themselves (the dashboard has no UI consumer of this module today — it's mobile-only — so this should come back empty; if it doesn't, note what references it and fix in this same task before committing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/meetings/invite.ts src/lib/meetings/invite.test.ts
git commit -m "feat(meetings): generalize invite lib from pairwise to N-participant meetings"
```

---

### Task 6: `src/lib/connections/validate.ts` (dashboard)

**Files:**
- Create: `src/lib/connections/validate.ts`
- Create: `src/lib/connections/validate.test.ts`

**Interfaces:**
- Produces: `CONNECTION_NOTES_MAX = 1000`, `ConnectionInput` type, `validateConnection(input): ValidationResult`. Tasks 11 (mobile port), 13 (mobile hook/UI) consume this.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, test, expect } from 'vitest';
import { validateConnection } from './validate';

describe('validateConnection()', () => {
  const ok = { contactName: 'Jane Doe', company: 'Acme', notes: 'Met at BLOCtail' };
  test('a complete connection is valid', () => {
    expect(validateConnection(ok).ok).toBe(true);
  });
  test('requires a contact name', () => {
    expect(validateConnection({ ...ok, contactName: '' }).ok).toBe(false);
    expect(validateConnection({ ...ok, contactName: '   ' }).ok).toBe(false);
  });
  test('caps contact name length', () => {
    expect(validateConnection({ ...ok, contactName: 'x'.repeat(121) }).ok).toBe(false);
  });
  test('caps notes length', () => {
    expect(validateConnection({ ...ok, notes: 'x'.repeat(1001) }).ok).toBe(false);
  });
  test('company/notes are optional', () => {
    expect(validateConnection({ contactName: 'Jane Doe' }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/connections/validate.test.ts`
Expected: FAIL — module `./validate` doesn't exist.

- [ ] **Step 3: Write the implementation**

```typescript
export const CONNECTION_NAME_MAX = 120;
export const CONNECTION_NOTES_MAX = 1000;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface ConnectionInput {
  contactName: string;
  company?: string | null;
  notes?: string | null;
}

/**
 * Validate a new connection (someone met but not yet ready to refer).
 * Only contactName is required; company/notes are optional but capped.
 * Pure → unit-tested + shared (web/mobile).
 */
export function validateConnection(input: ConnectionInput): ValidationResult {
  const name = (input.contactName ?? '').trim();
  if (name.length < 1) return { ok: false, error: 'Add their name.' };
  if (name.length > CONNECTION_NAME_MAX) {
    return { ok: false, error: `Name must be under ${CONNECTION_NAME_MAX} characters.` };
  }
  const notes = (input.notes ?? '').trim();
  if (notes.length > CONNECTION_NOTES_MAX) {
    return { ok: false, error: `Notes must be under ${CONNECTION_NOTES_MAX} characters.` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/connections/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connections/validate.ts src/lib/connections/validate.test.ts
git commit -m "feat(connections): add validateConnection lib + tests"
```

---

## Part C — Dashboard: admin hook + tab

### Task 7: `src/hooks/useNetworkingStats.ts`

**Files:**
- Create: `src/hooks/useNetworkingStats.ts`

**Interfaces:**
- Consumes: views `v_meeting_stats`, `v_connection_stats`, `v_referral_stats` (Task 3; `v_referral_stats` already exists from migration 032), table `members` (existing).
- Produces: hook return `{ rows: NetworkingStatsRow[], loading: boolean, error: string | null, refetch: () => Promise<void> }` where `NetworkingStatsRow = { member_id: string, name: string, chapter: string | null, meetings: number, connections: number, connectionsConverted: number, referralsGiven: number, referralsReceived: number, referralsClosed: number, referralsClosedValue: number }`. Task 8 (NetworkingTab) consumes this exact shape.

- [ ] **Step 1: Write the hook**

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface NetworkingStatsRow {
  member_id: string;
  name: string;
  chapter: string | null;
  meetings: number;
  connections: number;
  connectionsConverted: number;
  referralsGiven: number;
  referralsReceived: number;
  referralsClosed: number;
  referralsClosedValue: number;
}

/**
 * Admin-facing aggregate activity per member — counts only, sourced entirely
 * from the v_meeting_stats/v_connection_stats/v_referral_stats views (never
 * the raw meeting/connection/referral tables), so no meeting notes or
 * connection contact details are exposed here.
 */
export function useNetworkingStats() {
  const { session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [rows, setRows] = useState<NetworkingStatsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, meetingsRes, connectionsRes, referralsRes] = await Promise.all([
        supabase.from('members').select('id, name, chapter'),
        supabase.from('v_meeting_stats').select('member_id, meetings_count'),
        supabase.from('v_connection_stats').select('member_id, connections_count, converted_count'),
        supabase.from('v_referral_stats').select('member_id, given, received, closed, closed_value'),
      ]);
      const firstError =
        membersRes.error || meetingsRes.error || connectionsRes.error || referralsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      const meetingsById = new Map((meetingsRes.data ?? []).map((r) => [r.member_id, r.meetings_count]));
      const connectionsById = new Map(
        (connectionsRes.data ?? []).map((r) => [r.member_id, r]),
      );
      const referralsById = new Map((referralsRes.data ?? []).map((r) => [r.member_id, r]));

      const combined: NetworkingStatsRow[] = (membersRes.data ?? []).map((m) => {
        const conn = connectionsById.get(m.id);
        const ref = referralsById.get(m.id);
        return {
          member_id: m.id,
          name: m.name,
          chapter: m.chapter,
          meetings: meetingsById.get(m.id) ?? 0,
          connections: conn?.connections_count ?? 0,
          connectionsConverted: conn?.converted_count ?? 0,
          referralsGiven: ref?.given ?? 0,
          referralsReceived: ref?.received ?? 0,
          referralsClosed: ref?.closed ?? 0,
          referralsClosedValue: ref?.closed_value ?? 0,
        };
      });
      setRows(combined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `useNetworkingStats.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNetworkingStats.ts
git commit -m "feat(networking): add useNetworkingStats hook for the admin tab"
```

---

### Task 8: `NetworkingTab` admin component (leaderboard + org-wide toggle)

**Files:**
- Create: `src/components/tabs/NetworkingTab.tsx`

**Interfaces:**
- Consumes: `useNetworkingStats()` (Task 7), `useDashboardSettings()` (existing — `settings`, `updateSetting`, `isAdmin` gate already built in).

- [ ] **Step 1: Write the component**

```typescript
'use client';

import { useState } from 'react';
import { Handshake, Loader2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { useNetworkingStats, type NetworkingStatsRow } from '@/hooks/useNetworkingStats';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { useAuth } from '@/contexts/AuthContext';

type SortKey = 'meetings' | 'connections' | 'referralsGiven' | 'referralsClosedValue';

function sortRows(rows: NetworkingStatsRow[], key: SortKey): NetworkingStatsRow[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}

export function NetworkingTab() {
  const { rows, loading, error } = useNetworkingStats();
  const { settings, updateSetting } = useDashboardSettings();
  const { isAdmin } = useAuth();
  const [sortKey, setSortKey] = useState<SortKey>('referralsClosedValue');
  const [toggling, setToggling] = useState(false);

  const enabled = settings.networking_enabled !== 'false'; // default on
  const sorted = sortRows(rows, sortKey);

  async function handleToggle() {
    setToggling(true);
    await updateSetting('networking_enabled', enabled ? 'false' : 'true');
    setToggling(false);
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'meetings', label: 'Meetings' },
    { key: 'connections', label: 'Connections' },
    { key: 'referralsGiven', label: 'Referrals Given' },
    { key: 'referralsClosedValue', label: 'Closed $' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-5 rounded-r-xl flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Handshake className="text-blue-600 mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-blue-900">Networking Activity</h3>
            <p className="text-sm text-blue-800 mt-1">
              Aggregate counts only — meeting notes and connection contact details are
              never shown here, only how much activity each member is logging.
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={enabled}
            className="flex items-center gap-2 shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-900 disabled:opacity-50"
          >
            {toggling ? (
              <Loader2 size={16} className="animate-spin" />
            ) : enabled ? (
              <ToggleRight size={20} className="text-emerald-600" />
            ) : (
              <ToggleLeft size={20} className="text-slate-400" />
            )}
            {enabled ? 'Enabled for all members' : 'Disabled for all members'}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-bloc-blue" />
        </div>
      )}
      {error && (
        <div className="text-center py-10">
          <AlertCircle size={32} className="mx-auto mb-2 text-red-300" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <Card padding="sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 px-3 font-medium">Member</th>
                  {columns.map((c) => (
                    <th key={c.key} className="py-2 px-3 font-medium">
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        className={`hover:text-slate-900 ${sortKey === c.key ? 'text-bloc-blue font-semibold' : ''}`}
                      >
                        {c.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.member_id} className="border-b border-slate-100">
                    <td className="py-2 px-3">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      {r.chapter && <span className="text-xs text-slate-400 ml-1.5">{r.chapter}</span>}
                    </td>
                    <td className="py-2 px-3">{r.meetings}</td>
                    <td className="py-2 px-3">
                      {r.connections}
                      {r.connectionsConverted > 0 && (
                        <span className="text-xs text-emerald-600 ml-1">({r.connectionsConverted} converted)</span>
                      )}
                    </td>
                    <td className="py-2 px-3">{r.referralsGiven}</td>
                    <td className="py-2 px-3">${r.referralsClosedValue.toLocaleString()}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No activity logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `NetworkingTab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/NetworkingTab.tsx
git commit -m "feat(networking): add admin NetworkingTab (leaderboard + org-wide toggle)"
```

---

### Task 9: Wire `NetworkingTab` into the Manage hub

**Files:**
- Modify: `src/lib/nav/manage.ts`
- Modify: `src/components/tabs/ManageTab.tsx`
- Modify: `src/components/tabs/index.ts`

**Interfaces:**
- Consumes: `NetworkingTab` (Task 8), `MANAGE_TOOLS` array shape (existing, `src/lib/nav/manage.ts`).

- [ ] **Step 1: Add the tool entry**

In `src/lib/nav/manage.ts`, add to `MANAGE_TOOLS` (after the `'roster'` entry, before `'seats'`, matching the existing non-admin-only tools):

```typescript
  { key: 'networking', label: 'Networking', adminOnly: false },
```

- [ ] **Step 2: Register the component**

In `src/components/tabs/ManageTab.tsx`, add the import:

```typescript
import { NetworkingTab } from './NetworkingTab';
```

And add to the `COMPONENTS` map:

```typescript
  networking: <NetworkingTab />,
```

- [ ] **Step 3: Export from the tabs barrel**

In `src/components/tabs/index.ts`, add:

```typescript
export { NetworkingTab } from './NetworkingTab';
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav/manage.ts src/components/tabs/ManageTab.tsx src/components/tabs/index.ts
git commit -m "feat(networking): surface the Networking tab in the Manage hub"
```

---

## Part D — Mobile: ported shared lib logic

### Task 10: Port the N-participant `invite.ts` to mobile

**Files:**
- Modify: `src/lib/meetings/invite.ts` (mobile repo: `bloc-membership-mobile`)
- Modify: `src/lib/meetings/invite.test.ts` (mobile repo)

**Interfaces:**
- Produces: identical exports to Task 5 (`validateMeeting`, `myParticipantStatus`, `canCancel`, `categorizeMeetings`, `Meeting`, `Participant`, `MeetingStatus`, `ParticipantStatus`, `MEETING_KINDS`, `MeetingKind`, `MEETING_KIND_LABEL`). Tasks 12 (hook) and 17 (screen) in the mobile repo consume these.

- [ ] **Step 1: Copy the dashboard's finished, tested `invite.ts` and `invite.test.ts`**

Copy the exact contents written in Task 5 Steps 1 and 3 into the mobile repo's `src/lib/meetings/invite.ts` and `src/lib/meetings/invite.test.ts`, with one change: add a header comment matching the existing mobile convention (see the current file's line 1) —

```typescript
// Ported from the web repo's src/lib/meetings/invite.ts (the tested source of truth).
```

as the first line of `invite.ts`, above the `MEETING_KINDS` export.

- [ ] **Step 2: Run the tests**

Run (from the mobile repo root): `npx vitest run src/lib/meetings/invite.test.ts`
Expected: PASS (identical test suite to Task 5, already proven correct there).

- [ ] **Step 3: Commit**

```bash
git add src/lib/meetings/invite.ts src/lib/meetings/invite.test.ts
git commit -m "feat(meetings): port N-participant invite lib from web (source of truth)"
```

---

### Task 11: Port `connections/validate.ts` to mobile

**Files:**
- Create: `src/lib/connections/validate.ts` (mobile repo)
- Create: `src/lib/connections/validate.test.ts` (mobile repo)

**Interfaces:**
- Produces: identical exports to Task 6 (`validateConnection`, `ConnectionInput`, `CONNECTION_NAME_MAX`, `CONNECTION_NOTES_MAX`). Task 13 (mobile hook/screen) consumes this.

- [ ] **Step 1: Copy the dashboard's finished, tested files**

Copy the exact contents from Task 6 Steps 1 and 3, with the same "Ported from the web repo's..." header comment convention added as the first line of `validate.ts`.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/lib/connections/validate.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/connections/validate.ts src/lib/connections/validate.test.ts
git commit -m "feat(connections): port validateConnection lib from web (source of truth)"
```

---

## Part E — Mobile: hooks

### Task 12: `useMeetings.ts` — replaces `useMeetingInvites.ts` + `useOneToOnes.ts`

**Files:**
- Create: `src/hooks/useMeetings.ts`
- Delete: `src/hooks/useMeetingInvites.ts`
- Delete: `src/hooks/useOneToOnes.ts`

**Interfaces:**
- Consumes: `meetings`/`meeting_participants` tables (Task 1), `validateMeeting`/`Meeting`/`Participant`/`MeetingKind` from `@/lib/meetings/invite` (Task 10).
- Produces: `useMeetings()` returning `{ meetings: Meeting[], loading, unavailable, refresh, proposeMeeting, logMeeting, respond, cancel, complete }`. Task 17 (screen) consumes this exact shape.
  - `proposeMeeting(organizerId, participantIds, kind, proposedAt, location?, note?)`
  - `logMeeting(organizerId, participantIds, kind, metOn, location?, note?)`
  - `respond(meetingId, memberId, status: 'accepted'|'declined')`
  - `cancel(meetingId)`
  - `complete(meetingId)` — marks a `proposed` meeting `completed` once it's happened (replaces the old "Log as 1-to-1" conversion — there's no separate table to write into anymore, it's the same row).

- [ ] **Step 1: Write the hook**

```typescript
import { useCallback, useEffect, useState } from 'react';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { validateMeeting, type Meeting, type MeetingKind, type Participant } from '@/lib/meetings/invite';

interface MeetingRow {
  id: string;
  organizer_member_id: string;
  kind: MeetingKind;
  status: Meeting['status'];
  proposed_at: string | null;
  met_on: string | null;
  location: string | null;
  note: string | null;
}

/**
 * The current member's meetings (RLS scopes to participants + staff), joined
 * with their participant rows client-side. Supabase-direct + realtime.
 * Degrades to `unavailable` if migration 046 isn't applied.
 */
export function useMeetings() {
  const { session } = useAuth();
  const configured = isSupabaseConfigured();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!configured || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [meetingsRes, participantsRes] = await Promise.all([
        supabase.from('meetings').select('*').order('proposed_at', { ascending: true }),
        supabase.from('meeting_participants').select('meeting_id, member_id, response_status'),
      ]);
      if (meetingsRes.error || participantsRes.error) {
        setUnavailable(true);
        setMeetings([]);
        return;
      }
      const byMeeting = new Map<string, Participant[]>();
      for (const p of participantsRes.data ?? []) {
        const list = byMeeting.get(p.meeting_id) ?? [];
        list.push({ member_id: p.member_id, response_status: p.response_status });
        byMeeting.set(p.meeting_id, list);
      }
      const combined: Meeting[] = (meetingsRes.data as MeetingRow[] ?? []).map((m) => ({
        ...m,
        participants: byMeeting.get(m.id) ?? [],
      }));
      setMeetings(combined);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [configured, session]);

  useEffect(() => {
    load();
    if (!configured || !session) return;
    const channel = supabase
      .channel(`meetings-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, configured, session]);

  async function createMeeting(
    organizerId: string,
    participantIds: string[],
    kind: MeetingKind,
    status: 'proposed' | 'completed',
    opts: { proposedAt?: string | null; metOn?: string | null; location?: string | null; note?: string | null },
  ): Promise<{ error?: string }> {
    const v = validateMeeting({
      organizerId,
      participantIds,
      kind,
      proposedAt: opts.proposedAt,
      metOn: opts.metOn,
    });
    if (!v.ok) return { error: v.error };
    const { data, error } = await supabase
      .from('meetings')
      .insert([{
        organizer_member_id: organizerId,
        kind,
        status,
        proposed_at: opts.proposedAt ?? null,
        met_on: opts.metOn ?? null,
        location: opts.location?.trim() || null,
        note: opts.note?.trim() || null,
      }])
      .select('id')
      .single();
    if (error || !data) return { error: error?.message ?? 'Failed to create meeting.' };
    const participantRows = [organizerId, ...participantIds].map((memberId) => ({
      meeting_id: data.id,
      member_id: memberId,
      response_status: (status === 'completed' || memberId === organizerId ? 'accepted' : 'pending') as
        | 'pending'
        | 'accepted',
    }));
    const { error: partErr } = await supabase.from('meeting_participants').insert(participantRows);
    if (partErr) return { error: partErr.message };
    await load();
    return {};
  }

  const proposeMeeting = useCallback(
    (
      organizerId: string,
      participantIds: string[],
      kind: MeetingKind,
      proposedAt: string,
      location?: string | null,
      note?: string | null,
    ) => createMeeting(organizerId, participantIds, kind, 'proposed', { proposedAt, location, note }),
    [load],
  );

  const logMeeting = useCallback(
    (
      organizerId: string,
      participantIds: string[],
      kind: MeetingKind,
      metOn: string,
      location?: string | null,
      note?: string | null,
    ) => createMeeting(organizerId, participantIds, kind, 'completed', { metOn, location, note }),
    [load],
  );

  const respond = useCallback(
    async (meetingId: string, memberId: string, status: 'accepted' | 'declined'): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('meeting_participants')
        .update({ response_status: status })
        .eq('meeting_id', meetingId)
        .eq('member_id', memberId);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  const cancel = useCallback(
    async (meetingId: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('meetings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  const complete = useCallback(
    async (meetingId: string, proposedAt: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('meetings')
        .update({ status: 'completed', met_on: proposedAt.slice(0, 10), updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  return { meetings, loading, unavailable, refresh: load, proposeMeeting, logMeeting, respond, cancel, complete };
}
```

- [ ] **Step 2: Delete the two legacy hooks**

```bash
git rm src/hooks/useMeetingInvites.ts src/hooks/useOneToOnes.ts
```

- [ ] **Step 3: Typecheck** (screens still referencing the deleted hooks will fail here — that's expected; Task 17 fixes it)

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors in `meetings.tsx` and `one-to-ones.tsx` only (unresolved imports) — confirm no *other* files reference the deleted hooks. Do not fix those screens in this task; Task 17 handles them.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMeetings.ts
git commit -m "feat(meetings): add useMeetings hook, remove legacy pairwise hooks"
```

---

### Task 13: `useConnections.ts`

**Files:**
- Create: `src/hooks/useConnections.ts`

**Interfaces:**
- Consumes: `connections` table (Task 2), `validateConnection`/`ConnectionInput` from `@/lib/connections/validate` (Task 11).
- Produces: `useConnections()` returning `{ connections: Connection[], loading, unavailable, refresh, addConnection, archiveConnection }`. Task 19 (screen) and Task 20 (referrals screen's "convert" entry point) consume this.

- [ ] **Step 1: Write the hook**

```typescript
import { useCallback, useEffect, useState } from 'react';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { validateConnection } from '@/lib/connections/validate';

export interface Connection {
  id: string;
  member_id: string;
  contact_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: string;
}

export interface NewConnection {
  member_id: string;
  contact_name: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

/**
 * The current member's own connections (RLS scopes to member_id + staff).
 * Supabase-direct + realtime. Degrades to `unavailable` if migration 047
 * isn't applied.
 */
export function useConnections() {
  const { session } = useAuth();
  const configured = isSupabaseConfigured();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!configured || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        setUnavailable(true);
        setConnections([]);
      } else {
        setConnections((data ?? []) as Connection[]);
        setUnavailable(false);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [configured, session]);

  useEffect(() => {
    load();
    if (!configured || !session) return;
    const channel = supabase
      .channel(`connections-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, configured, session]);

  const addConnection = useCallback(
    async (input: NewConnection): Promise<{ error?: string }> => {
      const v = validateConnection({ contactName: input.contact_name, company: input.company, notes: input.notes });
      if (!v.ok) return { error: v.error };
      const { error } = await supabase.from('connections').insert([input]);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  const archiveConnection = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('connections')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  return { connections, loading, unavailable, refresh: load, addConnection, archiveConnection };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `useConnections.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useConnections.ts
git commit -m "feat(connections): add useConnections hook"
```

---

### Task 14: Extend `useReferrals.ts` with `source_connection_id`

**Files:**
- Modify: `src/hooks/useReferrals.ts`

**Interfaces:**
- Consumes: `referrals.source_connection_id` (Task 2).
- Produces: `Referral.source_connection_id: string | null` added to the existing type; `NewReferral.source_connection_id?: string` added to the existing input type. Task 19/20 (connections screen's "convert" action, referrals screen display) consume this.

- [ ] **Step 1: Add the field to both interfaces**

In `src/hooks/useReferrals.ts`, change the `Referral` interface to add one field after `closed_value`:

```typescript
  closed_value: number | null;
  source_connection_id: string | null;
```

And the `NewReferral` interface to add one optional field after `description`:

```typescript
  description?: string;
  source_connection_id?: string;
```

No other change is needed — `createReferral` already spreads `input` directly into the insert, so the new optional field passes through automatically.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReferrals.ts
git commit -m "feat(referrals): thread source_connection_id through useReferrals"
```

---

### Task 15: `useNetworkingTracker.ts`

**Files:**
- Create: `src/hooks/useNetworkingTracker.ts`

**Interfaces:**
- Consumes: views `v_meeting_stats`, `v_connection_stats`, `v_referral_stats` (Task 3), `members` table (existing).
- Produces: same `NetworkingStatsRow` shape as Task 7 (dashboard), returned as `{ rows, loading, error, refetch }`. Task 21 (tracker screen) consumes this.

- [ ] **Step 1: Write the hook**

This is the mobile counterpart of Task 7 — same query shape, same combining logic, same `NetworkingStatsRow` type (kept as a separate copy per this codebase's lib/hook duplication convention, not imported cross-repo).

```typescript
import { useCallback, useEffect, useState } from 'react';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface NetworkingStatsRow {
  member_id: string;
  name: string;
  chapter: string | null;
  meetings: number;
  connections: number;
  connectionsConverted: number;
  referralsGiven: number;
  referralsReceived: number;
  referralsClosed: number;
  referralsClosedValue: number;
}

/**
 * Member-facing activity leaderboard — counts only, from the same three
 * aggregate views the admin dashboard tab reads. Visible to every member.
 */
export function useNetworkingTracker() {
  const { session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [rows, setRows] = useState<NetworkingStatsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, meetingsRes, connectionsRes, referralsRes] = await Promise.all([
        supabase.from('members').select('id, name, chapter'),
        supabase.from('v_meeting_stats').select('member_id, meetings_count'),
        supabase.from('v_connection_stats').select('member_id, connections_count, converted_count'),
        supabase.from('v_referral_stats').select('member_id, given, received, closed, closed_value'),
      ]);
      const firstError =
        membersRes.error || meetingsRes.error || connectionsRes.error || referralsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      const meetingsById = new Map((meetingsRes.data ?? []).map((r) => [r.member_id, r.meetings_count]));
      const connectionsById = new Map((connectionsRes.data ?? []).map((r) => [r.member_id, r]));
      const referralsById = new Map((referralsRes.data ?? []).map((r) => [r.member_id, r]));

      setRows(
        (membersRes.data ?? []).map((m) => {
          const conn = connectionsById.get(m.id);
          const ref = referralsById.get(m.id);
          return {
            member_id: m.id,
            name: m.name,
            chapter: m.chapter,
            meetings: meetingsById.get(m.id) ?? 0,
            connections: conn?.connections_count ?? 0,
            connectionsConverted: conn?.converted_count ?? 0,
            referralsGiven: ref?.given ?? 0,
            referralsReceived: ref?.received ?? 0,
            referralsClosed: ref?.closed ?? 0,
            referralsClosedValue: ref?.closed_value ?? 0,
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNetworkingTracker.ts
git commit -m "feat(networking): add useNetworkingTracker hook for the mobile leaderboard"
```

---

### Task 16: `useNetworkingEnabled.ts`

**Files:**
- Create: `src/hooks/useNetworkingEnabled.ts`

**Interfaces:**
- Consumes: `dashboard_settings` row `networking_enabled` (Task 3).
- Produces: `useNetworkingEnabled(): boolean` (read-only — the mobile app never writes this key; Task 8's dashboard toggle is the only writer). Tasks 22 (hub) and 24 (guard on screens) consume this.

- [ ] **Step 1: Write the hook**

```typescript
import { useEffect, useState } from 'react';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Reads the org-wide networking_enabled toggle (dashboard_settings). Read-only
 * on mobile — the admin dashboard is the only writer. Defaults to `true` (the
 * seeded default) if the row is missing or unreachable, so a transient fetch
 * failure doesn't hide the feature for everyone.
 */
export function useNetworkingEnabled(): boolean {
  const { session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!isConfigured || !session) return;
    let cancelled = false;
    supabase
      .from('dashboard_settings')
      .select('value')
      .eq('key', 'networking_enabled')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setEnabled(data.value !== 'false');
      });
    return () => {
      cancelled = true;
    };
  }, [isConfigured, session]);

  return enabled;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNetworkingEnabled.ts
git commit -m "feat(networking): add useNetworkingEnabled read hook"
```

---

## Part F — Mobile: screens

### Task 17: Rewrite `meetings.tsx` for N participants (replaces `meetings.tsx` + `one-to-ones.tsx`)

**Files:**
- Modify: `src/app/(tabs)/meetings.tsx`
- Delete: `src/app/(tabs)/one-to-ones.tsx`

**Interfaces:**
- Consumes: `useMeetings()` (Task 12), `useMyMember()`/`useMembers()` (existing), `validateMeeting`/`categorizeMeetings`/`myParticipantStatus`/`canCancel`/`MEETING_KIND_LABEL` from `@/lib/meetings/invite` (Task 10), `memberMatchesQuery` (existing, `@/lib/members/search`).

- [ ] **Step 1: Write the new screen** (replace the full contents of `meetings.tsx`)

```typescript
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Coffee, Utensils, Video, Check, X, Clock, ArrowRight, CalendarPlus, Users } from 'lucide-react-native';

import { useMeetings } from '@/hooks/useMeetings';
import { useMyMember } from '@/hooks/useMyMember';
import { useMembers } from '@/hooks/useMembers';
import { memberMatchesQuery } from '@/lib/members/search';
import {
  validateMeeting,
  categorizeMeetings,
  myParticipantStatus,
  canCancel,
  MEETING_KIND_LABEL,
  type MeetingKind,
  type Meeting,
} from '@/lib/meetings/invite';
import { Card, Button, Input, SearchInput } from '@/components/ui';
import { Avatar } from '@/components/Avatar';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICON: Record<MeetingKind, typeof Coffee> = { coffee: Coffee, lunch: Utensils, virtual: Video };
const TIME_SLOTS = [
  { label: '8:00a', h: 8, m: 0 },
  { label: '9:00a', h: 9, m: 0 },
  { label: '11:30a', h: 11, m: 30 },
  { label: '12:00p', h: 12, m: 0 },
  { label: '1:00p', h: 13, m: 0 },
  { label: '4:00p', h: 16, m: 0 },
  { label: '5:00p', h: 17, m: 0 },
  { label: '6:00p', h: 18, m: 0 },
];

function nextDays(n: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}
function dayLabel(d: Date, i: number): string {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`;
}
function formatTime(d: Date): string {
  const h12 = ((d.getHours() + 11) % 12) + 1;
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}
function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()} · ${formatTime(d)}`;
}

export default function MeetingsScreen() {
  const router = useRouter();
  const { member } = useMyMember();
  const { members } = useMembers();
  const { meetings, loading, unavailable, refresh, proposeMeeting, logMeeting, respond, cancel, complete } = useMeetings();

  const myId = member?.id ?? null;
  const days = useMemo(() => nextDays(14), []);
  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m]));
    return (id: string) => map.get(id);
  }, [members]);

  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'schedule' | 'log'>('schedule');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [pickQuery, setPickQuery] = useState('');
  const [kind, setKind] = useState<MeetingKind>('coffee');
  const [dayIdx, setDayIdx] = useState(1);
  const [slotIdx, setSlotIdx] = useState(1);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill when arriving from a member's profile ("Schedule a 1-to-1").
  const params = useLocalSearchParams<{ withId?: string }>();
  useEffect(() => {
    if (params.withId) {
      setParticipantIds([params.withId]);
      setShowForm(true);
    }
  }, [params.withId]);

  const pickOptions = useMemo(
    () =>
      members
        .filter((m) => m.id !== myId && !participantIds.includes(m.id) && memberMatchesQuery(m, pickQuery))
        .slice(0, 8),
    [members, myId, participantIds, pickQuery],
  );
  const cats = myId ? categorizeMeetings(meetings, myId) : null;

  function resetForm() {
    setMode('schedule');
    setParticipantIds([]);
    setPickQuery('');
    setKind('coffee');
    setDayIdx(1);
    setSlotIdx(1);
    setLocation('');
    setNote('');
    setShowForm(false);
  }

  async function submit() {
    if (!myId) return Alert.alert('No member record', 'Ask a director to link your login to your profile.');
    if (participantIds.length === 0) return Alert.alert('Pick at least one person', 'Who did you meet with?');
    setSaving(true);
    let res: { error?: string };
    if (mode === 'log') {
      const metOn = new Date().toISOString().slice(0, 10);
      const v = validateMeeting({ organizerId: myId, participantIds, kind, metOn, location });
      if (!v.ok) {
        setSaving(false);
        return Alert.alert('Check the details', v.error ?? 'Invalid');
      }
      res = await logMeeting(myId, participantIds, kind, metOn, location.trim() || null, note.trim() || null);
    } else {
      const slot = TIME_SLOTS[slotIdx];
      const when = new Date(days[dayIdx]);
      when.setHours(slot.h, slot.m, 0, 0);
      const proposedAt = when.toISOString();
      const v = validateMeeting({ organizerId: myId, participantIds, kind, proposedAt, location });
      if (!v.ok) {
        setSaving(false);
        return Alert.alert('Check the details', v.error ?? 'Invalid');
      }
      res = await proposeMeeting(myId, participantIds, kind, proposedAt, location.trim() || null, note.trim() || null);
    }
    setSaving(false);
    if (res.error) Alert.alert('Could not save', res.error);
    else resetForm();
  }

  const KindRow = (
    <View className="flex-row gap-2">
      {(['coffee', 'lunch', 'virtual'] as MeetingKind[]).map((k) => {
        const Icon = KIND_ICON[k];
        const on = kind === k;
        return (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${on ? 'bg-blue-50 border border-bloc-blue' : 'border border-slate-200'}`}
          >
            <Icon size={15} color={on ? '#2563eb' : '#94a3b8'} />
            <Text className={on ? 'font-semibold text-bloc-blue' : 'text-slate-600'}>{MEETING_KIND_LABEL[k]}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  function confirmCancel(id: string, message: string) {
    Alert.alert('Cancel this?', message, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          const { error } = await cancel(id);
          if (error) Alert.alert('Failed', error);
        },
      },
    ]);
  }

  function otherNames(m: Meeting): string {
    if (!myId) return '';
    return m.participants
      .filter((p) => p.member_id !== myId)
      .map((p) => nameOf(p.member_id)?.name ?? 'A member')
      .join(', ');
  }

  function MeetingCard({ m, variant }: { m: Meeting; variant: 'respond' | 'awaiting' | 'upcoming' | 'past' }) {
    const Icon = KIND_ICON[m.kind];
    const isGroup = m.participants.length > 2;
    const elapsedNeedsLogging = variant === 'past' && m.status === 'proposed';
    return (
      <View className="border-t border-slate-100 pt-3">
        <View className="flex-row items-center gap-2">
          <Icon size={15} color="#2563eb" />
          <Text className="font-semibold text-slate-900">{otherNames(m)}</Text>
          {isGroup && <Users size={12} color="#94a3b8" />}
          <Text className="text-xs text-slate-500">· {MEETING_KIND_LABEL[m.kind]}</Text>
        </View>
        {!!m.proposed_at && (
          <View className="mt-1 flex-row items-center gap-1">
            <Clock size={12} color="#94a3b8" />
            <Text className="text-xs text-slate-600">{formatWhen(m.proposed_at)}</Text>
          </View>
        )}
        {!m.proposed_at && !!m.met_on && (
          <View className="mt-1 flex-row items-center gap-1">
            <Clock size={12} color="#94a3b8" />
            <Text className="text-xs text-slate-600">{m.met_on}</Text>
          </View>
        )}
        {!!m.location && <Text className="mt-0.5 text-xs text-slate-500">{m.location}</Text>}
        {!!m.note && <Text className="mt-0.5 text-xs italic text-slate-500">“{m.note}”</Text>}

        {variant === 'respond' && (
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Button
              title="Accept"
              size="sm"
              onPress={async () => {
                if (!myId) return;
                const { error } = await respond(m.id, myId, 'accepted');
                if (error) Alert.alert('Failed', error);
              }}
            />
            <Button
              title="Decline"
              size="sm"
              variant="ghost"
              onPress={async () => {
                if (!myId) return;
                const { error } = await respond(m.id, myId, 'declined');
                if (error) Alert.alert('Failed', error);
              }}
            />
          </View>
        )}
        {variant === 'awaiting' && myId && canCancel(m, myId) && (
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-amber-600">Waiting on the rest of the group</Text>
            <Pressable onPress={() => confirmCancel(m.id, 'This withdraws the meeting for everyone.')} accessibilityRole="button" accessibilityLabel="Cancel meeting">
              <Text className="text-xs text-red-500">Cancel</Text>
            </Pressable>
          </View>
        )}
        {variant === 'upcoming' && (
          <View className="mt-2 flex-row items-center gap-2">
            <View className="flex-row items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5">
              <Check size={11} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-700">Confirmed</Text>
            </View>
            {myId && canCancel(m, myId) && (
              <Pressable onPress={() => confirmCancel(m.id, 'This cancels the confirmed meeting for everyone.')} accessibilityRole="button" accessibilityLabel="Cancel meeting">
                <Text className="text-xs text-red-500">Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
        {elapsedNeedsLogging && (
          <View className="mt-2">
            <Button
              title="Mark as happened"
              size="sm"
              variant="secondary"
              onPress={async () => {
                if (!m.proposed_at) return;
                const { error } = await complete(m.id, m.proposed_at);
                if (error) Alert.alert('Failed', error);
              }}
            />
          </View>
        )}
        {variant === 'past' && m.status === 'completed' && (
          <View className="mt-1 flex-row items-center gap-1">
            <Check size={12} color="#94a3b8" />
            <Text className="text-xs text-slate-400">Logged</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4 gap-4"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-bloc-navy">
          Meetings
        </Text>
        <Text className="text-sm text-slate-600">
          Invite one member for a 1-on-1, or a few for a small-group meetup — coffee, lunch, or virtual.
        </Text>
      </View>

      {unavailable && (
        <View className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm text-amber-800">
            Meetings aren&apos;t available yet — it lights up once the database is ready.
          </Text>
        </View>
      )}

      {!showForm ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button title="Propose a meeting" onPress={() => { setMode('schedule'); setShowForm(true); }} />
          </View>
          <View className="flex-1">
            <Button title="Log a past meeting" variant="secondary" onPress={() => { setMode('log'); setShowForm(true); }} />
          </View>
        </View>
      ) : (
        <Card padding="lg" className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {mode === 'log' ? 'Met with' : 'Meet with'} ({participantIds.length} picked)
          </Text>
          {participantIds.map((id) => {
            const m = members.find((x) => x.id === id);
            if (!m) return null;
            return (
              <View key={id} className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Text className="font-medium text-slate-800">{m.name}</Text>
                <Pressable onPress={() => setParticipantIds((prev) => prev.filter((p) => p !== id))} accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`}>
                  <X size={16} color="#94a3b8" />
                </Pressable>
              </View>
            );
          })}
          <SearchInput value={pickQuery} onChangeText={setPickQuery} placeholder="Add another member…" maxLength={60} />
          {pickOptions.map((m) => (
            <Pressable key={m.id} onPress={() => { setParticipantIds((prev) => [...prev, m.id]); setPickQuery(''); }} className="flex-row items-center gap-2 border-b border-slate-100 py-2">
              <Avatar name={m.name} photoUrl={m.photoUrl} size={28} />
              <Text className="flex-1 text-sm text-slate-800">{m.name}</Text>
              <ArrowRight size={14} color="#94a3b8" />
            </Pressable>
          ))}
          {pickQuery.trim() !== '' && pickOptions.length === 0 && (
            <Text className="py-2 text-sm text-slate-400">No members match “{pickQuery.trim()}”.</Text>
          )}

          {KindRow}

          {mode === 'schedule' && (
            <>
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1" contentContainerClassName="px-1 gap-2">
                {days.map((d, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setDayIdx(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: dayIdx === i }}
                    className={`rounded-lg px-3 py-2 ${dayIdx === i ? 'bg-bloc-navy' : 'bg-white border border-slate-200'}`}
                  >
                    <Text className={`text-xs font-medium ${dayIdx === i ? 'text-white' : 'text-slate-600'}`}>{dayLabel(d, i)}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</Text>
              <View className="flex-row flex-wrap gap-2">
                {TIME_SLOTS.map((s, i) => (
                  <Pressable
                    key={s.label}
                    onPress={() => setSlotIdx(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: slotIdx === i }}
                    className={`rounded-lg px-3 py-2 ${slotIdx === i ? 'bg-bloc-navy' : 'bg-white border border-slate-200'}`}
                  >
                    <Text className={`text-xs font-medium ${slotIdx === i ? 'text-white' : 'text-slate-600'}`}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Input
            label={kind === 'virtual' ? 'Video link (optional)' : 'Place (optional)'}
            value={location}
            onChangeText={setLocation}
            placeholder={kind === 'virtual' ? 'https://… or “I’ll send a link”' : 'e.g. Not Just Coffee, Uptown'}
            maxLength={300}
          />
          <Input label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={500} />
          <Button title={mode === 'log' ? 'Save meeting' : 'Send invite'} onPress={submit} isLoading={saving} />
          <Button title="Cancel" variant="ghost" onPress={resetForm} />
        </Card>
      )}

      {cats && cats.needsMyResponse.length > 0 && (
        <Card padding="lg" className="gap-1">
          <View className="flex-row items-center gap-2">
            <CalendarPlus size={16} color="#2563eb" />
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Needs your response ({cats.needsMyResponse.length})
            </Text>
          </View>
          {cats.needsMyResponse.map((m) => <MeetingCard key={m.id} m={m} variant="respond" />)}
        </Card>
      )}

      {cats && cats.upcoming.length > 0 && (
        <Card padding="lg" className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming</Text>
          {cats.upcoming.map((m) => <MeetingCard key={m.id} m={m} variant="upcoming" />)}
        </Card>
      )}

      {cats && cats.awaitingOthers.length > 0 && (
        <Card padding="lg" className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Awaiting the group</Text>
          {cats.awaitingOthers.map((m) => <MeetingCard key={m.id} m={m} variant="awaiting" />)}
        </Card>
      )}

      {cats && cats.past.length > 0 && (
        <Card padding="lg" className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Past</Text>
          {cats.past.map((m) => <MeetingCard key={m.id} m={m} variant="past" />)}
        </Card>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Delete the legacy 1-to-1 screen**

```bash
git rm "src/app/(tabs)/one-to-ones.tsx"
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `meetings.tsx`. (`_layout.tsx` and `networking.tsx` will still reference the deleted screen — Tasks 22 and 23 fix those.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/meetings.tsx"
git commit -m "feat(meetings): rewrite meetings screen for N participants, remove legacy 1-to-1 screen"
```

---

### Task 18: New `connections.tsx` screen

**Files:**
- Create: `src/app/(tabs)/connections.tsx`

**Interfaces:**
- Consumes: `useConnections()` (Task 13), `validateConnection` from `@/lib/connections/validate` (Task 11).
- Produces: navigates to `/referrals` with `?fromConnectionId=<id>&contactName=...&company=...` on "Convert to referral" — Task 20 reads these params.

- [ ] **Step 1: Write the screen**

```typescript
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { UserPlus, ArrowRightCircle, Archive } from 'lucide-react-native';

import { useConnections } from '@/hooks/useConnections';
import { useMyMember } from '@/hooks/useMyMember';
import { validateConnection } from '@/lib/connections/validate';
import { Card, Button, Input } from '@/components/ui';
import { timeAgo } from '@/lib/format/relativeTime';

export default function ConnectionsScreen() {
  const router = useRouter();
  const { member } = useMyMember();
  const { connections, loading, unavailable, refresh, addConnection, archiveConnection } = useConnections();

  const [showForm, setShowForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const myId = member?.id ?? null;
  const active = connections.filter((c) => c.status === 'active');
  const archived = connections.filter((c) => c.status === 'archived');

  function resetForm() {
    setContactName('');
    setCompany('');
    setEmail('');
    setPhone('');
    setNotes('');
    setShowForm(false);
  }

  async function submit() {
    if (!myId) return Alert.alert('No member record', 'Ask a director to link your login to your profile.');
    const v = validateConnection({ contactName, company, notes });
    if (!v.ok) return Alert.alert('Check the details', v.error ?? 'Invalid');
    setSaving(true);
    const { error } = await addConnection({
      member_id: myId,
      contact_name: contactName.trim(),
      company: company.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) Alert.alert('Could not save', error);
    else resetForm();
  }

  function convertToReferral(c: (typeof connections)[number]) {
    router.push({
      pathname: '/referrals',
      params: {
        fromConnectionId: c.id,
        contactName: c.contact_name,
        company: c.company ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
      },
    } as never);
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4 gap-4"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-bloc-navy">
          Connections
        </Text>
        <Text className="text-sm text-slate-600">
          People you&apos;ve met but aren&apos;t ready to refer yet — one connection can turn into several referrals over time.
        </Text>
      </View>

      {unavailable && (
        <View className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm text-amber-800">
            Connections aren&apos;t available yet — it lights up once the database is ready.
          </Text>
        </View>
      )}

      {!showForm ? (
        <Button title="Log a connection" onPress={() => setShowForm(true)} />
      ) : (
        <Card padding="lg" className="gap-3">
          <Input label="Name" value={contactName} onChangeText={setContactName} placeholder="Who did you meet?" maxLength={120} />
          <Input label="Company (optional)" value={company} onChangeText={setCompany} maxLength={120} />
          <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={200} />
          <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
          <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
          <Button title="Save connection" onPress={submit} isLoading={saving} />
          <Button title="Cancel" variant="ghost" onPress={resetForm} />
        </Card>
      )}

      <View>
        <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Active ({active.length})
        </Text>
        {active.length === 0 ? (
          <Card padding="lg">
            <View className="items-center gap-2 py-4">
              <UserPlus size={28} color="#cbd5e1" />
              <Text className="text-center text-sm text-slate-500">No connections logged yet.</Text>
            </View>
          </Card>
        ) : (
          active.map((c) => (
            <Card key={c.id} padding="md" className="mb-2 gap-1">
              <Text className="font-semibold text-slate-900">{c.contact_name}</Text>
              {!!c.company && <Text className="text-sm text-slate-500">{c.company}</Text>}
              {!!c.notes && <Text className="text-xs text-slate-500">{c.notes}</Text>}
              <Text className="text-[11px] text-slate-400">{timeAgo(c.created_at)}</Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => convertToReferral(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Convert ${c.contact_name} to a referral`}
                  className="flex-row items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 active:bg-slate-50"
                >
                  <ArrowRightCircle size={13} color="#2563eb" />
                  <Text className="text-xs font-medium text-slate-700">Convert to referral</Text>
                </Pressable>
                <Pressable
                  onPress={() => archiveConnection(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Archive ${c.contact_name}`}
                  className="flex-row items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 active:bg-slate-50"
                >
                  <Archive size={13} color="#64748b" />
                  <Text className="text-xs font-medium text-slate-700">Archive</Text>
                </Pressable>
              </View>
            </Card>
          ))
        )}
      </View>

      {archived.length > 0 && (
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Archived ({archived.length})
          </Text>
          {archived.map((c) => (
            <Card key={c.id} padding="md" className="mb-2 opacity-60">
              <Text className="font-semibold text-slate-900">{c.contact_name}</Text>
              {!!c.company && <Text className="text-sm text-slate-500">{c.company}</Text>}
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `connections.tsx` (a warning/error about the `/referrals` route not yet accepting these params is resolved by Task 19).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/connections.tsx"
git commit -m "feat(connections): add connections screen with convert-to-referral"
```

---

### Task 19: Update `referrals.tsx` to accept a connection prefill and show the source

**Files:**
- Modify: `src/app/(tabs)/referrals.tsx`

**Interfaces:**
- Consumes: `fromConnectionId`/`contactName`/`company`/`email`/`phone` route params (Task 18), `Referral.source_connection_id`/`NewReferral.source_connection_id` (Task 14).

- [ ] **Step 1: Accept the new prefill params**

Change the params type and prefill effect (currently lines 102–108) from:

```typescript
  const params = useLocalSearchParams<{ toId?: string }>();
  useEffect(() => {
    if (params.toId) {
      setRecipientId(params.toId);
      setShowForm(true);
    }
  }, [params.toId]);
```

to:

```typescript
  const params = useLocalSearchParams<{
    toId?: string;
    fromConnectionId?: string;
    contactName?: string;
    company?: string;
    email?: string;
    phone?: string;
  }>();
  const [fromConnectionId, setFromConnectionId] = useState<string | null>(null);
  useEffect(() => {
    if (params.toId) {
      setRecipientId(params.toId);
      setShowForm(true);
    }
    if (params.fromConnectionId) {
      setFromConnectionId(params.fromConnectionId);
      setContactName(params.contactName ?? '');
      setCompany(params.company ?? '');
      setEmail(params.email ?? '');
      setPhone(params.phone ?? '');
      setShowForm(true);
    }
  }, [params.toId, params.fromConnectionId, params.contactName, params.company, params.email, params.phone]);
```

- [ ] **Step 2: Pass it through on submit**

In `submit()`, change the `createReferral` call to include the field:

```typescript
    const { error } = await createReferral({
      from_member_id: myId,
      to_member_id: recipientId,
      contact_name: contactName.trim(),
      contact_company: company.trim() || undefined,
      contact_phone: phone.trim() || undefined,
      contact_email: email.trim() || undefined,
      description: note.trim() || undefined,
      source_connection_id: fromConnectionId ?? undefined,
    });
```

And reset it in `resetForm()` by adding `setFromConnectionId(null);` alongside the other `set*('')` calls.

- [ ] **Step 3: Show the source in `ReferralRow`**

In the `ReferralRow` component, after the existing `{!!r.description && ...}` line, add:

```typescript
      {!!r.source_connection_id && (
        <Text className="text-xs text-slate-400">Sourced from a logged connection</Text>
      )}
```

(A full contact-name lookup isn't available here without an extra join — this is a deliberately simple indicator; skip fetching the connection's name to keep this task's scope to what the spec calls for.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(tabs)/referrals.tsx"
git commit -m "feat(referrals): accept connection prefill, show sourced-from-connection indicator"
```

---

### Task 20: New `networking-tracker.tsx` screen (mobile leaderboard)

**Files:**
- Create: `src/app/(tabs)/networking-tracker.tsx`

**Interfaces:**
- Consumes: `useNetworkingTracker()` (Task 15).

- [ ] **Step 1: Write the screen**

```typescript
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Trophy } from 'lucide-react-native';

import { useNetworkingTracker, type NetworkingStatsRow } from '@/hooks/useNetworkingTracker';
import { Card } from '@/components/ui';

type SortKey = 'meetings' | 'connections' | 'referralsGiven' | 'referralsClosedValue';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'referralsClosedValue', label: 'Closed $' },
  { key: 'referralsGiven', label: 'Referrals' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'connections', label: 'Connections' },
];

function sortRows(rows: NetworkingStatsRow[], key: SortKey): NetworkingStatsRow[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}

export default function NetworkingTrackerScreen() {
  const { rows, loading, refetch } = useNetworkingTracker();
  const [sortKey, setSortKey] = useState<SortKey>('referralsClosedValue');
  const sorted = sortRows(rows, sortKey);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerClassName="p-4 gap-4"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-bloc-navy">
          Tracker
        </Text>
        <Text className="text-sm text-slate-600">
          Chapter-wide meetings, connections, and referrals activity.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {SORTS.map((s) => (
          <View
            key={s.key}
            className={`rounded-full px-3 py-1.5 ${sortKey === s.key ? 'bg-bloc-navy' : 'bg-white border border-slate-200'}`}
            onTouchEnd={() => setSortKey(s.key)}
          >
            <Text className={`text-xs font-medium ${sortKey === s.key ? 'text-white' : 'text-slate-600'}`}>{s.label}</Text>
          </View>
        ))}
      </View>

      {sorted.map((r, i) => (
        <Card key={r.member_id} padding="md" className="flex-row items-center gap-3">
          <View className="w-6 items-center">
            {i < 3 ? <Trophy size={16} color={['#f59e0b', '#94a3b8', '#b45309'][i]} /> : <Text className="text-xs text-slate-400">{i + 1}</Text>}
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">{r.name}</Text>
            <Text className="text-xs text-slate-500">
              {r.meetings} meetings · {r.connections} connections · {r.referralsGiven} referrals
            </Text>
          </View>
          <Text className="text-sm font-semibold text-emerald-700">${r.referralsClosedValue.toLocaleString()}</Text>
        </Card>
      ))}

      {!loading && sorted.length === 0 && (
        <Card padding="lg">
          <Text className="text-center text-sm text-slate-500 py-4">No activity logged yet.</Text>
        </Card>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(tabs)/networking-tracker.tsx"
git commit -m "feat(networking): add mobile Tracker leaderboard screen"
```

---

### Task 21: Update the Networking hub + register/deregister screens + gate on the toggle

**Files:**
- Modify: `src/app/(tabs)/networking.tsx`
- Modify: `src/app/(tabs)/_layout.tsx`
- Modify: `src/app/(tabs)/more.tsx`

**Interfaces:**
- Consumes: `useNetworkingEnabled()` (Task 16).

- [ ] **Step 1: Update the hub's item list**

In `src/app/(tabs)/networking.tsx`, replace the `ITEMS` array's "Coffee & Meet-ups" and "1-to-1 Tracker" entries with one consolidated "Meetings" entry, and add "Connections" and "Tracker":

```typescript
const ITEMS: { route: Href; icon: LucideIcon; title: string; desc: string }[] = [
  { route: '/match' as Href, icon: Sparkles, title: 'Members you should meet', desc: 'Smart referral-partner matches + people you haven’t met yet.' },
  { route: '/referrals' as Href, icon: Gift, title: 'Referrals', desc: 'Pass referrals to members and track them to closed business.' },
  { route: '/meetings' as Href, icon: Coffee, title: 'Meetings', desc: 'Schedule a 1-on-1 or a small-group meetup — coffee, lunch, or virtual.' },
  { route: '/connections' as Href, icon: UserPlus, title: 'Connections', desc: 'People you’ve met but aren’t ready to refer yet.' },
  { route: '/socials' as Href, icon: PartyPopper, title: 'Social Events', desc: 'Host or RSVP to happy hours, meals, and group meet-ups.' },
  { route: '/asks' as Href, icon: Lightbulb, title: 'Asks & Offers', desc: 'Post what you need or can offer — and pass referrals.' },
  { route: '/testimonials' as Href, icon: Quote, title: 'Testimonials', desc: 'Endorse members you trust; see who has endorsed you.' },
  { route: '/attendance' as Href, icon: CalendarCheck, title: 'Attendance', desc: 'Check in at your chapter meetings.' },
  { route: '/networking-tracker' as Href, icon: Trophy, title: 'Tracker', desc: 'Chapter-wide meetings, connections, and referrals leaderboard.' },
];
```

Update the icon imports at the top of the file to add `UserPlus` and `Trophy` (and drop `CalendarPlus` if it's no longer used elsewhere in the file — check before removing):

```typescript
import { Gift, Coffee, PartyPopper, CalendarCheck, Lightbulb, Quote, Sparkles, ChevronRight, UserPlus, Trophy, type LucideIcon } from 'lucide-react-native';
```

Then gate the whole screen on the toggle — add near the top of the `NetworkingScreen` function body:

```typescript
  const enabled = useNetworkingEnabled();
```

and wrap the return with a disabled state:

```typescript
  if (!enabled) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-center text-slate-500">
          Networking features are currently turned off for the chapter.
        </Text>
      </View>
    );
  }
```

(placed before the existing `return (<ScrollView ...>` block), and add the import:

```typescript
import { useNetworkingEnabled } from '@/hooks/useNetworkingEnabled';
```

- [ ] **Step 2: Update `_layout.tsx` screen registrations**

In `src/app/(tabs)/_layout.tsx`, remove the line registering `one-to-ones` (deleted in Task 17):

```typescript
      <Tabs.Screen name="one-to-ones" options={{ href: null, title: '1-to-1 Meetings' }} />
```

and add two new hidden-from-tab-bar screens next to the existing `referrals`/`meetings` entries:

```typescript
      <Tabs.Screen name="connections" options={{ href: null, title: 'Connections' }} />
      <Tabs.Screen name="networking-tracker" options={{ href: null, title: 'Tracker' }} />
```

- [ ] **Step 3: No change needed in `more.tsx`**

Confirmed: the `Handshake`/"Networking" row (`src/app/(tabs)/more.tsx` line 84) is icon + label + `onPress` only, with no description text referencing the old feature set — nothing to update here. `_layout.tsx` and `networking.tsx` (Steps 1–2) are the only files that needed changes.

- [ ] **Step 4: Typecheck and confirm no remaining references to deleted screens**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `grep -rn "one-to-ones\|useOneToOnes\|useMeetingInvites" src --include="*.ts" --include="*.tsx"`
Expected: no results (confirms Task 4's Part A drop-migration gate is now satisfied on the app-code side).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(tabs)/networking.tsx" "src/app/(tabs)/_layout.tsx" "src/app/(tabs)/more.tsx"
git commit -m "feat(networking): consolidate hub entries, register new screens, gate on org-wide toggle"
```

---

## Self-Review Notes

**Spec coverage:** Group-capable meetings (Tasks 1, 5, 10, 12, 17) · connections entity + many-referrals link (Tasks 2, 6, 11, 13, 14, 18, 19) · admin dashboard visibility (Tasks 3, 7, 8, 9) · mobile leaderboard (Tasks 3, 15, 20) · org-wide toggle (Tasks 3, 8, 16, 21) · legacy table migration/cleanup (Tasks 1, 4, 12, 17, 21). All five Design sections of the spec have at least one corresponding task.

**Deferred by the spec itself, not by this plan:** geo-verified event check-in is explicitly out of scope (separate follow-up spec).

**Known follow-up inside this plan:** Task 4 (dropping `meeting_invites`/`one_to_ones`) is intentionally a manual, deferred gate — do not automate its Step 2.
