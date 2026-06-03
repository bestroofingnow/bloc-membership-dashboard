# One Lead Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three disjoint lead stores (`guests` kanban, `public_signups`, `intake_guests`/`intake_rsvps`) plus the card scanner into one additive lead spine (`leads`/`lead_links`/`lead_status_events`) keyed off `email_normalized`, with a single idempotent `link_lead()` RPC wired non-blockingly into `/api/join`, `/api/scan`, `/api/guest/submit`, and the RSVP-status PATCH — without migrating any data out of the existing tables or changing any current read.

**Architecture:** Migration `022_lead_funnel.sql` adds three RLS-protected tables, a `stage_rank()` immutable helper, a `link_lead()` SECURITY DEFINER RPC granted to `service_role` only, a staff-only `v_lead_pipeline` view, and an idempotent backfill guarded by a `dashboard_settings` sentinel. The pure stage-projection logic (`stage_rank`, `map_kanban_stage`, RSVP→stage) is first extracted into `src/lib/leads/stage.ts` and unit-tested with vitest, then mirrored verbatim in SQL. Server routes call the RPC via the existing service-role client inside `try/catch` so a spine hiccup never blocks a real submit, and existing UI reads (`PipelineTab`/`IntakeGuestsTab`) are untouched this slice.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Supabase (Postgres + RLS), Tailwind, vitest. Supabase project ref ksmtkisknnvrjdfigsll.

---

## File Structure

| Path | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/leads/stage.ts` | Create | Pure TS: canonical `LeadStage` ladder, `stageRank()`, `mapKanbanStage()` (8 legacy `guests.status` → canonical), `mapRsvpStatusToStage()` (RSVP status → canonical). Single source of truth mirrored into SQL. |
| `src/lib/leads/stage.test.ts` | Create | vitest unit tests for `stageRank`/`mapKanbanStage`/`mapRsvpStatusToStage`. |
| `src/lib/leads/linkLead.ts` | Create | Server helper `linkLead(sb, args)` wrapping the `link_lead` RPC in try/catch; never throws. Used by all three routes. |
| `supabase/migrations/022_lead_funnel.sql` | Create | `leads`/`lead_links`/`lead_status_events` tables, `stage_rank()`, `map_kanban_stage()`, `link_lead()` RPC, `v_lead_pipeline` view, RLS via `005` helpers (no anon), sentinel-guarded backfill. |
| `src/app/api/join/route.ts` | Modify | After `public_signups` insert, capture `.select('id')` and call `linkLead(...)` with `source='public_signup'`, `stage='applied'`. |
| `src/app/api/scan/route.ts` | Modify | Link new/existing `guests` row + `business_card_scans` row to one lead (`source='card_scan'`); existing-member match records a networking touch with `matched_member_id` but no pipeline lead. |
| `src/app/api/guest/submit/route.ts` | Modify | Link `intake_guest` + `intake_rsvp` to one lead (`source='qr_rsvp'`), projecting RSVP status onto stage, attribution from the authoritative QR token. |
| `src/app/api/admin/intake-rsvps/[id]/route.ts` | Modify | When the PATCH sets `status='attended'`, advance the linked lead to `'attended'` (forward-only) via `linkLead`. |

---

## Task 1 — Pure stage-projection logic (TDD)

The canonical ladder, the kanban→canonical projection, and the RSVP→canonical projection are pure functions. Extract them first so the SQL `stage_rank()`/`map_kanban_stage()` and route wiring all agree on one tested mapping.

**Files**
- Create: `src/lib/leads/stage.ts`
- Create: `src/lib/leads/stage.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create `src/lib/leads/stage.test.ts` with the FULL contents below.

```ts
import { describe, test, expect } from 'vitest';
import {
  LEAD_STAGES,
  stageRank,
  mapKanbanStage,
  mapRsvpStatusToStage,
} from './stage';

describe('LEAD_STAGES + stageRank()', () => {
  test('canonical ladder order is new<rsvp<attended<applied<approved<member', () => {
    expect(LEAD_STAGES).toEqual([
      'new', 'rsvp', 'attended', 'applied', 'approved', 'member', 'declined',
    ]);
    expect(stageRank('new')).toBe(0);
    expect(stageRank('rsvp')).toBe(1);
    expect(stageRank('attended')).toBe(2);
    expect(stageRank('applied')).toBe(3);
    expect(stageRank('approved')).toBe(4);
    expect(stageRank('member')).toBe(5);
  });

  test('declined ranks 9 (terminal, off the forward ladder)', () => {
    expect(stageRank('declined')).toBe(9);
  });

  test('unknown stage ranks -1 so it never wins a forward-only compare', () => {
    expect(stageRank('bogus' as never)).toBe(-1);
  });
});

describe('mapKanbanStage() — 8 legacy guests.status values onto the ladder', () => {
  test('each legacy status maps to the spec-defined canonical stage', () => {
    expect(mapKanbanStage('New Lead')).toBe('new');
    expect(mapKanbanStage('After Hours Invited')).toBe('rsvp');
    expect(mapKanbanStage('After Hours Done')).toBe('attended');
    expect(mapKanbanStage('Lunch Invited')).toBe('attended');
    expect(mapKanbanStage('Lunch Done')).toBe('attended');
    expect(mapKanbanStage('Application Sent')).toBe('applied');
    expect(mapKanbanStage('Application Received')).toBe('applied');
    expect(mapKanbanStage('Approved')).toBe('approved');
    expect(mapKanbanStage('Declined')).toBe('declined');
  });

  test('unrecognized status falls back to new (never throws)', () => {
    expect(mapKanbanStage('whatever' as never)).toBe('new');
  });
});

describe('mapRsvpStatusToStage() — intake_rsvps.status onto the ladder', () => {
  test('registered=>rsvp, attended=>attended, no_show=>rsvp, canceled=>declined', () => {
    expect(mapRsvpStatusToStage('registered')).toBe('rsvp');
    expect(mapRsvpStatusToStage('attended')).toBe('attended');
    expect(mapRsvpStatusToStage('no_show')).toBe('rsvp');
    expect(mapRsvpStatusToStage('canceled')).toBe('declined');
  });

  test('unknown status falls back to rsvp (a QR RSVP at minimum RSVP-ed)', () => {
    expect(mapRsvpStatusToStage('bogus' as never)).toBe('rsvp');
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** Run `npm test -- src/lib/leads/stage.test.ts`. Expected failure: `Failed to resolve import "./stage"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation.** Create `src/lib/leads/stage.ts` with the FULL contents below.

```ts
// Canonical lead ladder shared by the DB (022_lead_funnel.sql) and the API routes.
// Keep stageRank() and mapKanbanStage() byte-aligned with the SQL functions of the
// same name — this file is the source of truth they are transcribed from.

export type LeadStage =
  | 'new'
  | 'rsvp'
  | 'attended'
  | 'applied'
  | 'approved'
  | 'member'
  | 'declined';

// Forward ladder order; 'declined' is terminal and listed last.
export const LEAD_STAGES: LeadStage[] = [
  'new', 'rsvp', 'attended', 'applied', 'approved', 'member', 'declined',
];

const RANK: Record<LeadStage, number> = {
  new: 0,
  rsvp: 1,
  attended: 2,
  applied: 3,
  approved: 4,
  member: 5,
  declined: 9,
};

/** Numeric rank for forward-only comparisons. Unknown => -1 (never wins forward). */
export function stageRank(stage: LeadStage): number {
  return Object.prototype.hasOwnProperty.call(RANK, stage) ? RANK[stage] : -1;
}

/** Project the 8 legacy guests.status values onto the canonical ladder. */
export function mapKanbanStage(status: string): LeadStage {
  switch (status) {
    case 'New Lead':
      return 'new';
    case 'After Hours Invited':
      return 'rsvp';
    case 'After Hours Done':
    case 'Lunch Invited':
    case 'Lunch Done':
      return 'attended';
    case 'Application Sent':
    case 'Application Received':
      return 'applied';
    case 'Approved':
      return 'approved';
    case 'Declined':
      return 'declined';
    default:
      return 'new';
  }
}

/** Project an intake_rsvps.status onto the canonical ladder. */
export function mapRsvpStatusToStage(status: string): LeadStage {
  switch (status) {
    case 'registered':
      return 'rsvp';
    case 'attended':
      return 'attended';
    case 'no_show':
      return 'rsvp';
    case 'canceled':
      return 'declined';
    default:
      return 'rsvp';
  }
}
```

- [ ] **Step 4: Run the test, expect PASS.** Run `npm test -- src/lib/leads/stage.test.ts`. Expected: all 7 tests pass, exit code 0.

- [ ] **Step 5: Commit.** Run:
```
git add src/lib/leads/stage.ts src/lib/leads/stage.test.ts
git commit -m "feat(leads): pure canonical stage ladder + kanban/rsvp projections"
```

---

## Task 2 — The `022_lead_funnel.sql` migration: tables + `stage_rank` + RLS

Create the additive tables with RLS via the `005` helpers and no anon policy. `lead_links.UNIQUE(source_table, source_id)` is the no-orphan glue. This step is verified with concrete SQL run against the live DB.

**Files**
- Create: `supabase/migrations/022_lead_funnel.sql` (tables + `stage_rank` + RLS portion; functions/view/backfill added in Tasks 3-5)

**Steps**

- [ ] **Step 1: Create the migration file with tables, `stage_rank()`, and RLS.** Create `supabase/migrations/022_lead_funnel.sql` with EXACTLY the contents below. (Tasks 3, 4, 5 append to this same file.)

```sql
-- ============================================================
-- Migration 022: One Lead Funnel (additive spine)
-- The three lead stores (guests / public_signups / intake_guests+rsvps) plus
-- the card scanner feed ONE lead model keyed off email_normalized.
-- ADDITIVE ONLY: no data migrated out, source rows stay in their own tables,
-- lead_links is the no-orphan glue. New tables get NO anon policy; public
-- writers use the service role (bypasses RLS).
-- ============================================================

-- ---------- stage_rank(): forward-only ladder (mirrors src/lib/leads/stage.ts) ----------
CREATE OR REPLACE FUNCTION public.stage_rank(s TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'new'      THEN 0
    WHEN 'rsvp'     THEN 1
    WHEN 'attended' THEN 2
    WHEN 'applied'  THEN 3
    WHEN 'approved' THEN 4
    WHEN 'member'   THEN 5
    WHEN 'declined' THEN 9
    ELSE -1
  END
$$;

-- ---------- leads: one row per person ----------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT UNIQUE,                  -- nullable: scanner no-email & handwritten leads
  name TEXT,
  company TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('public_signup','qr_rsvp','card_scan','manual','import')),
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','rsvp','attended','applied','approved','member','declined')),
  invited_by_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  owner_profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_due TIMESTAMPTZ,
  matched_member_id   UUID REFERENCES public.members(id) ON DELETE SET NULL,
  converted_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_email_normalized_idx ON public.leads(email_normalized);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads(stage);
CREATE INDEX IF NOT EXISTS leads_invited_by_idx ON public.leads(invited_by_member_id);
CREATE INDEX IF NOT EXISTS leads_next_action_due_idx ON public.leads(next_action_due);

-- ---------- lead_links: polymorphic glue, the no-orphan mechanism ----------
CREATE TABLE IF NOT EXISTS public.lead_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL CHECK (source_table IN
    ('guests','public_signups','intake_guests','intake_rsvps','business_card_scans')),
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, source_id)   -- every source row links exactly once
);

CREATE INDEX IF NOT EXISTS lead_links_lead_id_idx ON public.lead_links(lead_id);

-- ---------- lead_status_events: append-only shared timeline ----------
CREATE TABLE IF NOT EXISTS public.lead_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_status_events_lead_id_idx ON public.lead_status_events(lead_id);

-- ---------- RLS: staff read+write via the 005 helpers; NO anon policy ----------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_staff_rw" ON public.leads;
CREATE POLICY "leads_staff_rw" ON public.leads
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

DROP POLICY IF EXISTS "lead_links_staff_rw" ON public.lead_links;
CREATE POLICY "lead_links_staff_rw" ON public.lead_links
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

DROP POLICY IF EXISTS "lead_status_events_staff_rw" ON public.lead_status_events;
CREATE POLICY "lead_status_events_staff_rw" ON public.lead_status_events
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_chapter_director())
  WITH CHECK (public.is_admin() OR public.is_chapter_director());

-- updated_at trigger reuse (update_updated_at_column() defined in 001)
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

- [ ] **Step 2: Apply the migration to the live DB.** Apply `022_lead_funnel.sql` against project `ksmtkisknnvrjdfigsll` (Supabase MCP `apply_migration` with name `022_lead_funnel`, or paste into the SQL editor). Expected: success, no error.

- [ ] **Step 3: Verify tables, the unique glue, and `stage_rank` exist.** Run this SQL via the Supabase SQL editor / MCP `execute_sql`:
```sql
SELECT
  to_regclass('public.leads')              AS leads,
  to_regclass('public.lead_links')         AS lead_links,
  to_regclass('public.lead_status_events') AS lead_status_events,
  (SELECT public.stage_rank('member'))     AS rank_member,
  (SELECT public.stage_rank('declined'))   AS rank_declined,
  (SELECT count(*) FROM pg_constraint
     WHERE conname = 'lead_links_source_table_source_id_key') AS unique_glue;
```
Expected exactly one row: `leads`, `lead_links`, `lead_status_events` all non-null; `rank_member=5`; `rank_declined=9`; `unique_glue=1`.

- [ ] **Step 4: Verify NO anon policy and helper-based read isolation.** Run:
```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('leads','lead_links','lead_status_events')
ORDER BY tablename, policyname;
```
Expected: exactly 3 rows (one per table), each `roles={authenticated}` (never `{anon}`), `cmd=ALL`. (Red-team mitigation: members get zero rows cleanly; these are new tables so there is no fabrication risk.)

- [ ] **Step 5: Commit.** Run:
```
git add "supabase/migrations/022_lead_funnel.sql"
git commit -m "feat(leads): 022 lead_funnel tables + stage_rank + staff-only RLS"
```

---

## Task 3 — `map_kanban_stage()` + `link_lead()` RPC (service_role only)

Append the SQL kanban projection (mirroring the tested TS) and the single idempotent entry point. `link_lead` finds-or-creates by email, enriches blanks only (never clobbers human edits), links the source row `ON CONFLICT DO NOTHING`, appends a timeline event, and advances stage forward-only. `GRANT EXECUTE` to `service_role` only.

**Files**
- Modify: `supabase/migrations/022_lead_funnel.sql` (append functions)

**Steps**

- [ ] **Step 1: Append `map_kanban_stage()` and `link_lead()` to the migration.** Append the FOLLOWING block to the end of `supabase/migrations/022_lead_funnel.sql`.

```sql
-- ---------- map_kanban_stage(): mirrors src/lib/leads/stage.ts mapKanbanStage ----------
CREATE OR REPLACE FUNCTION public.map_kanban_stage(legacy_status TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE legacy_status
    WHEN 'New Lead'             THEN 'new'
    WHEN 'After Hours Invited'  THEN 'rsvp'
    WHEN 'After Hours Done'     THEN 'attended'
    WHEN 'Lunch Invited'        THEN 'attended'
    WHEN 'Lunch Done'           THEN 'attended'
    WHEN 'Application Sent'     THEN 'applied'
    WHEN 'Application Received' THEN 'applied'
    WHEN 'Approved'            THEN 'approved'
    WHEN 'Declined'            THEN 'declined'
    ELSE 'new'
  END
$$;

-- ---------- link_lead(): the single idempotent entry point ----------
-- find-or-create by email; enrich blanks only; link source row ON CONFLICT DO NOTHING;
-- append a timeline event; advance stage forward-only. SECURITY DEFINER so it can
-- write across RLS; GRANTed to service_role only.
CREATE OR REPLACE FUNCTION public.link_lead(
  p_source_table TEXT,
  p_source_id    UUID,
  p_email        TEXT DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_company      TEXT DEFAULT NULL,
  p_phone        TEXT DEFAULT NULL,
  p_source       TEXT DEFAULT 'manual',
  p_stage        TEXT DEFAULT 'new',
  p_invited_by_member_id UUID DEFAULT NULL,
  p_matched_member_id    UUID DEFAULT NULL,
  p_actor_profile_id     UUID DEFAULT NULL,
  p_note         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_norm TEXT := NULLIF(lower(btrim(p_email)), '');
  v_lead_id UUID;
  v_existing_link UUID;
  v_old_stage TEXT;
BEGIN
  -- Validate the canonical stage; bad input falls back to 'new' rather than erroring.
  IF public.stage_rank(p_stage) < 0 THEN
    p_stage := 'new';
  END IF;

  -- 0) If this exact source row is already linked, reuse its lead (idempotent re-runs).
  SELECT lead_id INTO v_existing_link
  FROM public.lead_links
  WHERE source_table = p_source_table AND source_id = p_source_id;

  IF v_existing_link IS NOT NULL THEN
    v_lead_id := v_existing_link;
  ELSIF v_email_norm IS NOT NULL THEN
    -- 1) Find-or-create by normalized email.
    SELECT id INTO v_lead_id FROM public.leads WHERE email_normalized = v_email_norm;
  END IF;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (email_normalized, name, company, phone, source, stage,
                              invited_by_member_id, matched_member_id)
    VALUES (v_email_norm, NULLIF(btrim(p_name),''), NULLIF(btrim(p_company),''),
            NULLIF(btrim(p_phone),''), p_source, p_stage,
            p_invited_by_member_id, p_matched_member_id)
    RETURNING id INTO v_lead_id;
  ELSE
    -- 2) Enrich BLANKS ONLY — never clobber human-edited fields.
    UPDATE public.leads SET
      name                 = COALESCE(name, NULLIF(btrim(p_name),'')),
      company              = COALESCE(company, NULLIF(btrim(p_company),'')),
      phone                = COALESCE(phone, NULLIF(btrim(p_phone),'')),
      email_normalized     = COALESCE(email_normalized, v_email_norm),
      invited_by_member_id = COALESCE(invited_by_member_id, p_invited_by_member_id),
      matched_member_id    = COALESCE(matched_member_id, p_matched_member_id),
      updated_at           = NOW()
    WHERE id = v_lead_id;
  END IF;

  -- 3) Link the source row (idempotent).
  INSERT INTO public.lead_links (lead_id, source_table, source_id)
  VALUES (v_lead_id, p_source_table, p_source_id)
  ON CONFLICT (source_table, source_id) DO NOTHING;

  -- 4) Advance stage forward-only and append a timeline event when it actually moves.
  SELECT stage INTO v_old_stage FROM public.leads WHERE id = v_lead_id;
  IF public.stage_rank(p_stage) > public.stage_rank(v_old_stage) THEN
    UPDATE public.leads SET stage = p_stage, updated_at = NOW() WHERE id = v_lead_id;
    INSERT INTO public.lead_status_events
      (lead_id, from_stage, to_stage, source_table, source_id, actor_profile_id, note)
    VALUES (v_lead_id, v_old_stage, p_stage, p_source_table, p_source_id, p_actor_profile_id, p_note);
  ELSE
    -- No forward move, but still record the touch (e.g. a networking scan).
    INSERT INTO public.lead_status_events
      (lead_id, from_stage, to_stage, source_table, source_id, actor_profile_id, note)
    VALUES (v_lead_id, v_old_stage, v_old_stage, p_source_table, p_source_id, p_actor_profile_id, p_note);
  END IF;

  RETURN v_lead_id;
END;
$$;

-- The RPC is the only write path; lock it to the service role (public writers use it).
REVOKE ALL ON FUNCTION public.link_lead(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_lead(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT
) TO service_role;
```

- [ ] **Step 2: Apply the appended functions to the live DB.** Re-apply `022_lead_funnel.sql` (the `CREATE OR REPLACE`/`IF NOT EXISTS` make it safe to re-run). Expected: success, no error.

- [ ] **Step 3: Verify the grant is service_role-only.** Run:
```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'link_lead'
ORDER BY grantee;
```
Expected: `service_role | EXECUTE`, and NO row for `PUBLIC`, `anon`, or `authenticated`.

- [ ] **Step 4: Smoke-test idempotency + forward-only with a disposable lead.** Run this in a single transaction and confirm the asserted counts, then it rolls back so no test data persists:
```sql
BEGIN;
-- two calls with the same source row + email must yield ONE lead and ONE link.
SELECT public.link_lead('guests', '00000000-0000-0000-0000-000000000001'::uuid,
  'Fingerprint Lead', 'fp@example.com', 'FP Co', NULL, 'card_scan', 'new') AS lead_a;
SELECT public.link_lead('guests', '00000000-0000-0000-0000-000000000001'::uuid,
  'Fingerprint Lead', 'fp@example.com', 'FP Co', NULL, 'card_scan', 'rsvp') AS lead_b;
SELECT
  (SELECT count(*) FROM public.leads WHERE email_normalized='fp@example.com')      AS lead_count,   -- expect 1
  (SELECT count(*) FROM public.lead_links
     WHERE source_table='guests' AND source_id='00000000-0000-0000-0000-000000000001') AS link_count, -- expect 1
  (SELECT stage FROM public.leads WHERE email_normalized='fp@example.com')         AS stage,        -- expect 'rsvp'
  (SELECT count(*) FROM public.lead_status_events le
     JOIN public.leads l ON l.id=le.lead_id WHERE l.email_normalized='fp@example.com') AS events;   -- expect 2
ROLLBACK;
```
Expected single row: `lead_count=1`, `link_count=1`, `stage='rsvp'`, `events=2`.

- [ ] **Step 5: Verify a backward stage call does NOT regress.** Run:
```sql
BEGIN;
SELECT public.link_lead('guests', '00000000-0000-0000-0000-000000000002'::uuid,
  'Back Test', 'back@example.com', 'B Co', NULL, 'card_scan', 'attended');
SELECT public.link_lead('guests', '00000000-0000-0000-0000-000000000002'::uuid,
  'Back Test', 'back@example.com', 'B Co', NULL, 'card_scan', 'new');
SELECT stage FROM public.leads WHERE email_normalized='back@example.com';  -- expect 'attended'
ROLLBACK;
```
Expected: `attended` (forward-only held).

- [ ] **Step 6: Commit.** Run:
```
git add "supabase/migrations/022_lead_funnel.sql"
git commit -m "feat(leads): map_kanban_stage + idempotent forward-only link_lead RPC (service_role)"
```

---

## Task 4 — `v_lead_pipeline` staff view

Add the staff-only board view with the `has_*` flags, inviter name, and overdue flag. Not consumed by any UI this slice — it ships independently.

**Files**
- Modify: `supabase/migrations/022_lead_funnel.sql` (append view)

**Steps**

- [ ] **Step 1: Append the view to the migration.** Append the FOLLOWING to the end of `supabase/migrations/022_lead_funnel.sql`.

```sql
-- ---------- v_lead_pipeline: staff-only board view (no UI consumer this slice) ----------
-- security_invoker so the underlying leads/lead_links RLS (staff-only) is enforced
-- per-caller; members select zero rows cleanly.
CREATE OR REPLACE VIEW public.v_lead_pipeline
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.email_normalized,
  l.name,
  l.company,
  l.phone,
  l.source,
  l.stage,
  l.invited_by_member_id,
  m.name AS invited_by_member_name,
  l.owner_profile_id,
  l.next_action,
  l.next_action_due,
  l.matched_member_id,
  l.converted_member_id,
  l.ghl_contact_id,
  l.created_at,
  l.updated_at,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'intake_rsvps')        AS has_qr_rsvp,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'business_card_scans') AS has_scan,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'public_signups')      AS has_application,
  EXISTS (SELECT 1 FROM public.lead_links ll
            WHERE ll.lead_id = l.id AND ll.source_table = 'guests')              AS has_kanban_card,
  (l.next_action_due IS NOT NULL AND l.next_action_due < NOW())                  AS is_overdue
FROM public.leads l
LEFT JOIN public.members m ON m.id = l.invited_by_member_id;

GRANT SELECT ON public.v_lead_pipeline TO authenticated;
```

- [ ] **Step 2: Apply to the live DB.** Re-apply `022_lead_funnel.sql`. Expected: success.

- [ ] **Step 3: Verify the view columns exist.** Run:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'v_lead_pipeline'
  AND column_name IN ('has_qr_rsvp','has_scan','has_application','has_kanban_card',
                      'invited_by_member_name','is_overdue')
ORDER BY column_name;
```
Expected: 6 rows (all six names present).

- [ ] **Step 4: Verify `security_invoker` is on (members get zero rows, not a PII firehose).** Run:
```sql
SELECT c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'v_lead_pipeline' AND n.nspname = 'public';
```
Expected: `reloptions` contains `security_invoker=true`.

- [ ] **Step 5: Commit.** Run:
```
git add "supabase/migrations/022_lead_funnel.sql"
git commit -m "feat(leads): v_lead_pipeline staff-only board view (security_invoker)"
```

---

## Task 5 — Idempotent backfill across all sources (sentinel-guarded)

One lead per distinct `email_normalized` across all sources, strongest-identity-first (`intake_guests` → `guests` → `public_signups` → `business_card_scans`); email-less rows get their own lead; every source row gets a `lead_links` row. Guarded by a `dashboard_settings` sentinel so re-running the migration is a no-op. Verification asserts **0 unlinked** per table. Respects the red-team mitigation: additive linkage only, never delete a source row, never delete a live-magic-link `intake_guests`.

**Files**
- Modify: `supabase/migrations/022_lead_funnel.sql` (append backfill)

**Steps**

- [ ] **Step 1: Append the sentinel-guarded backfill to the migration.** Append the FOLLOWING to the end of `supabase/migrations/022_lead_funnel.sql`. It calls `link_lead` per source row in strongest-identity-first order. `link_lead` itself is idempotent, but the outer sentinel keeps a re-applied migration from re-scanning.

```sql
-- ---------- Backfill (idempotent, guarded by a dashboard_settings sentinel) ----------
-- Strongest-identity-first so the canonical lead inherits the richest record:
--   intake_guests -> guests -> public_signups -> business_card_scans.
-- Email-less rows still get their own lead (link_lead handles NULL email).
-- ADDITIVE ONLY: never deletes a source row, never touches intake_guests with a live
-- magic link. lead_links UNIQUE(source_table,source_id) makes every row link once.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Sentinel: skip if a prior run already completed.
  IF EXISTS (SELECT 1 FROM public.dashboard_settings WHERE key = 'lead_funnel_backfill_done') THEN
    RAISE NOTICE 'lead_funnel backfill already done; skipping';
    RETURN;
  END IF;

  -- 1) intake_guests (+ their RSVPs) — strongest identity (verified email + RSVP).
  FOR r IN
    SELECT ig.id AS guest_id,
           ig.email_normalized,
           (ig.first_name || ' ' || ig.last_name) AS full_name,
           ig.business_name,
           rsv.id AS rsvp_id,
           rsv.status AS rsvp_status,
           rsv.invited_by_member_id
    FROM public.intake_guests ig
    LEFT JOIN LATERAL (
      SELECT id, status, invited_by_member_id
      FROM public.intake_rsvps
      WHERE guest_id = ig.id
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1
    ) rsv ON TRUE
  LOOP
    PERFORM public.link_lead(
      'intake_guests', r.guest_id, r.email_normalized, r.full_name, r.business_name, NULL,
      'qr_rsvp',
      CASE r.rsvp_status
        WHEN 'attended' THEN 'attended'
        WHEN 'canceled' THEN 'declined'
        WHEN 'no_show'  THEN 'rsvp'
        ELSE 'rsvp'
      END,
      r.invited_by_member_id, NULL, NULL, 'backfill: intake_guests'
    );
    IF r.rsvp_id IS NOT NULL THEN
      PERFORM public.link_lead(
        'intake_rsvps', r.rsvp_id, r.email_normalized, r.full_name, r.business_name, NULL,
        'qr_rsvp',
        CASE r.rsvp_status
          WHEN 'attended' THEN 'attended'
          WHEN 'canceled' THEN 'declined'
          WHEN 'no_show'  THEN 'rsvp'
          ELSE 'rsvp'
        END,
        r.invited_by_member_id, NULL, NULL, 'backfill: intake_rsvps'
      );
    END IF;
  END LOOP;

  -- 2) guests (kanban) — project the 8 legacy statuses; full granularity stays in guests.status.
  FOR r IN
    SELECT id, NULLIF(lower(btrim(email)),'') AS email_normalized, name, company, phone, status
    FROM public.guests
  LOOP
    PERFORM public.link_lead(
      'guests', r.id, r.email_normalized, r.name, r.company, r.phone,
      'card_scan', public.map_kanban_stage(r.status),
      NULL, NULL, NULL, 'backfill: guests'
    );
  END LOOP;

  -- 3) public_signups — applied-to-join.
  FOR r IN
    SELECT id, NULLIF(lower(btrim(email)),'') AS email_normalized, name, company, phone
    FROM public.public_signups
  LOOP
    PERFORM public.link_lead(
      'public_signups', r.id, r.email_normalized, r.name, r.company, r.phone,
      'public_signup', 'applied', NULL, NULL, NULL, 'backfill: public_signups'
    );
  END LOOP;

  -- 4) business_card_scans — weakest identity (no-email rows still get a lead).
  FOR r IN
    SELECT id,
           COALESCE(email_normalized, NULLIF(lower(btrim(email)),'')) AS email_normalized,
           name, company, phone, target_member_id
    FROM public.business_card_scans
  LOOP
    PERFORM public.link_lead(
      'business_card_scans', r.id, r.email_normalized, r.name, r.company, r.phone,
      'card_scan', 'new', NULL, r.target_member_id, NULL, 'backfill: business_card_scans'
    );
  END LOOP;

  INSERT INTO public.dashboard_settings (key, value)
  VALUES ('lead_funnel_backfill_done', NOW()::text)
  ON CONFLICT (key) DO NOTHING;
END $$;
```

- [ ] **Step 2: Apply the backfill to the live DB.** Re-apply `022_lead_funnel.sql`. Expected: success; on first run, the backfill executes; on any re-run, NOTICE `lead_funnel backfill already done; skipping`.

- [ ] **Step 3: Verify 0 unlinked rows per source table (the no-orphan Go/No-Go check).** Run:
```sql
SELECT 'guests' AS src, count(*) AS unlinked FROM public.guests g
  LEFT JOIN public.lead_links ll ON ll.source_table='guests' AND ll.source_id=g.id
  WHERE ll.id IS NULL
UNION ALL
SELECT 'public_signups', count(*) FROM public.public_signups p
  LEFT JOIN public.lead_links ll ON ll.source_table='public_signups' AND ll.source_id=p.id
  WHERE ll.id IS NULL
UNION ALL
SELECT 'intake_guests', count(*) FROM public.intake_guests ig
  LEFT JOIN public.lead_links ll ON ll.source_table='intake_guests' AND ll.source_id=ig.id
  WHERE ll.id IS NULL
UNION ALL
SELECT 'intake_rsvps', count(*) FROM public.intake_rsvps rs
  LEFT JOIN public.lead_links ll ON ll.source_table='intake_rsvps' AND ll.source_id=rs.id
  WHERE ll.id IS NULL
UNION ALL
SELECT 'business_card_scans', count(*) FROM public.business_card_scans bcs
  LEFT JOIN public.lead_links ll ON ll.source_table='business_card_scans' AND ll.source_id=bcs.id
  WHERE ll.id IS NULL;
```
Expected: 5 rows, every `unlinked = 0`.

- [ ] **Step 4: Verify a cross-source person collapses to exactly one lead.** Run (replace `<email>` with a real `email_normalized` known to exist in BOTH `intake_guests` and `guests`, found via the helper query below):
```sql
-- helper to find a cross-source email:
SELECT ig.email_normalized
FROM public.intake_guests ig
JOIN public.guests g ON NULLIF(lower(btrim(g.email)),'') = ig.email_normalized
LIMIT 1;
-- then assert one lead:
SELECT email_normalized, count(*) FROM public.leads
WHERE email_normalized = '<email>' GROUP BY email_normalized;
```
Expected (if such an email exists): `count = 1`. If the helper returns no rows, this overlap simply does not exist in the data — record that and move on.

- [ ] **Step 5: Verify source rows were never deleted (counts unchanged).** Run:
```sql
SELECT
  (SELECT count(*) FROM public.guests)              AS guests,
  (SELECT count(*) FROM public.public_signups)      AS public_signups,
  (SELECT count(*) FROM public.intake_guests)       AS intake_guests,
  (SELECT count(*) FROM public.intake_rsvps)        AS intake_rsvps,
  (SELECT count(*) FROM public.business_card_scans) AS business_card_scans;
```
Expected: identical to the pre-`022` snapshot (record both; any drop is a regression — red-team risk #4).

- [ ] **Step 6: Commit.** Run:
```
git add "supabase/migrations/022_lead_funnel.sql"
git commit -m "feat(leads): sentinel-guarded idempotent backfill (0 unlinked, additive)"
```

---

## Task 6 — `linkLead` server helper (never throws)

A tiny non-blocking wrapper so every route calls the RPC identically and a spine hiccup is logged but never bubbles up to block a real submit (red-team mitigation: `link_lead` failure never blocks `/api/join|scan|submit`).

**Files**
- Create: `src/lib/leads/linkLead.ts`

**Steps**

- [ ] **Step 1: Create the helper.** Create `src/lib/leads/linkLead.ts` with the FULL contents below.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadStage } from './stage';

export interface LinkLeadArgs {
  source_table: 'guests' | 'public_signups' | 'intake_guests' | 'intake_rsvps' | 'business_card_scans';
  source_id: string;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  source: 'public_signup' | 'qr_rsvp' | 'card_scan' | 'manual' | 'import';
  stage: LeadStage;
  invited_by_member_id?: string | null;
  matched_member_id?: string | null;
  actor_profile_id?: string | null;
  note?: string | null;
}

/**
 * Non-blocking call to the link_lead RPC. NEVER throws: a lead-spine failure must
 * never block a real /api/join|scan|submit. Returns the lead id, or null on failure.
 * `sb` must be a service-role client (the RPC is GRANTed to service_role only).
 */
export async function linkLead(
  sb: SupabaseClient,
  args: LinkLeadArgs,
): Promise<string | null> {
  try {
    const { data, error } = await sb.rpc('link_lead', {
      p_source_table: args.source_table,
      p_source_id: args.source_id,
      p_email: args.email ?? null,
      p_name: args.name ?? null,
      p_company: args.company ?? null,
      p_phone: args.phone ?? null,
      p_source: args.source,
      p_stage: args.stage,
      p_invited_by_member_id: args.invited_by_member_id ?? null,
      p_matched_member_id: args.matched_member_id ?? null,
      p_actor_profile_id: args.actor_profile_id ?? null,
      p_note: args.note ?? null,
    });
    if (error) {
      console.error('link_lead failed (non-blocking):', error.message, args.source_table, args.source_id);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error('link_lead threw (non-blocking):', e, args.source_table, args.source_id);
    return null;
  }
}
```

- [ ] **Step 2: Type-check the helper.** Run `npx tsc --noEmit`. Expected: no new errors referencing `src/lib/leads/linkLead.ts`.

- [ ] **Step 3: Commit.** Run:
```
git add src/lib/leads/linkLead.ts
git commit -m "feat(leads): non-blocking linkLead server helper (never throws)"
```

---

## Task 7 — Wire `/api/join` (public_signup → applied, lead-only)

After the `public_signups` insert, capture the new row id and link it as a lead at stage `'applied'`. Stays lead-only (never `'member'`), honoring invite-only.

**Files**
- Modify: `src/app/api/join/route.ts` (current insert at L70-88 discards the id)

**Steps**

- [ ] **Step 1: Add the imports.** In `src/app/api/join/route.ts`, the top of the file currently reads:
```ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
```
Replace it with:
```ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { linkLead } from '@/lib/leads/linkLead';
```

- [ ] **Step 2: Capture the inserted id and link the lead.** In `src/app/api/join/route.ts`, the current insert + error block reads:
```ts
  const { error } = await supabase.from('public_signups').insert([
    {
      name: body.name.trim(),
      company: body.company.trim(),
      industry: body.industry?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      referral_source: body.referralSource?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  ]);

  if (error) {
    console.error('Failed to insert signup:', error);
    return NextResponse.json(
      { error: 'Failed to submit. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
```
Replace it with:
```ts
  const { data: inserted, error } = await supabase
    .from('public_signups')
    .insert([
      {
        name: body.name.trim(),
        company: body.company.trim(),
        industry: body.industry?.trim() || null,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        referral_source: body.referralSource?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    ])
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('Failed to insert signup:', error);
    return NextResponse.json(
      { error: 'Failed to submit. Please try again.' },
      { status: 500 }
    );
  }

  // Non-blocking: link into the one lead funnel. Lead-only (never 'member') — invite-only.
  await linkLead(supabase, {
    source_table: 'public_signups',
    source_id: inserted.id,
    email: body.email?.trim() || null,
    name: body.name.trim(),
    company: body.company.trim(),
    phone: body.phone?.trim() || null,
    source: 'public_signup',
    stage: 'applied',
    note: 'web join form',
  });

  return NextResponse.json({ success: true });
```

- [ ] **Step 2b: Type-check.** Run `npx tsc --noEmit`. Expected: no new errors in `src/app/api/join/route.ts`.

- [ ] **Step 3: Smoke-test the route links a lead without blocking the submit.** With the dev server running (`npm run dev`), run:
```
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/join \
  -H 'content-type: application/json' \
  -d '{"name":"Join Funnel Test","company":"JFT Co","email":"join-funnel-test@example.com"}'
```
Expected HTTP code: `200`. Then verify the lead landed:
```sql
SELECT l.stage, l.source, ll.source_table
FROM public.leads l
JOIN public.lead_links ll ON ll.lead_id = l.id
WHERE l.email_normalized = 'join-funnel-test@example.com';
```
Expected one row: `stage='applied'`, `source='public_signup'`, `source_table='public_signups'`. Clean up: `DELETE FROM public.public_signups WHERE email='join-funnel-test@example.com'; DELETE FROM public.leads WHERE email_normalized='join-funnel-test@example.com';`

- [ ] **Step 4: Commit.** Run:
```
git add "src/app/api/join/route.ts"
git commit -m "feat(join): link public_signup into one lead funnel (applied, non-blocking)"
```

---

## Task 8 — Wire `/api/scan` (card_scan; preserve existing-member guard)

Link both the new/existing `guests` row and the `business_card_scans` row to one lead (`source='card_scan'`). For an existing **member** match, record a networking-touch event with `matched_member_id` but no pipeline lead beyond the scan row — preserving the scanner's existing-member guard. Email-less scans still link (the scan row gets its own lead).

**Files**
- Modify: `src/app/api/scan/route.ts` (insert + match resolution at L168-317)

**Steps**

- [ ] **Step 1: Add the import.** In `src/app/api/scan/route.ts`, the top currently reads:
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
```
Replace it with:
```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { linkLead } from '@/lib/leads/linkLead';
```

- [ ] **Step 2: Link the new guest row to a lead right after it is created.** In `src/app/api/scan/route.ts`, the block that creates a new guest currently ends:
```ts
        if (newGuestErr) {
          console.error('Failed to create guest from scan:', newGuestErr);
        } else if (newGuest) {
          targetGuestId = (newGuest as { id: string; name: string }).id;
          guestName = (newGuest as { id: string; name: string }).name;
          matchType = 'new_guest';
        }
      }
```
Replace it with:
```ts
        if (newGuestErr) {
          console.error('Failed to create guest from scan:', newGuestErr);
        } else if (newGuest) {
          targetGuestId = (newGuest as { id: string; name: string }).id;
          guestName = (newGuest as { id: string; name: string }).name;
          matchType = 'new_guest';
        }
      }

      // Link the guests row (new OR pre-existing) into the one lead funnel.
      // Existing-member matches have no targetGuestId, so this is skipped for them.
      if (targetGuestId) {
        await linkLead(supabase, {
          source_table: 'guests',
          source_id: targetGuestId,
          email: emailNormalized,
          name: inputName || extractedData.name || null,
          company: inputCompany || extractedData.company || null,
          phone: extractedData.phone || null,
          source: 'card_scan',
          stage: 'new',
          actor_profile_id: scannedByProfileId,
          note: 'card scan → guest',
        });
      }
```

- [ ] **Step 3: Link the scan row itself after it is inserted (covers email-less + member-match touches).** In `src/app/api/scan/route.ts`, the scan-insert block currently ends:
```ts
      if (scanErr) {
        console.error('Failed to save scan:', scanErr);
      } else {
        scanId = scanRow?.id || null;
      }
```
Replace it with:
```ts
      if (scanErr) {
        console.error('Failed to save scan:', scanErr);
      } else {
        scanId = scanRow?.id || null;
      }

      // Link the scan row into the lead funnel. For an existing-member match we record
      // a networking touch with matched_member_id but NO forward pipeline lead beyond
      // this scan (preserves the scanner's existing-member guard). Email-less scans
      // still get their own lead so nothing is dropped.
      if (scanId) {
        await linkLead(supabase, {
          source_table: 'business_card_scans',
          source_id: scanId,
          email: emailNormalized,
          name: extractedData.name || null,
          company: extractedData.company || null,
          phone: extractedData.phone || null,
          source: 'card_scan',
          stage: 'new',
          matched_member_id: targetMemberId,
          actor_profile_id: scannedByProfileId,
          note: matchType === 'existing_member'
            ? 'networking touch (existing member)'
            : 'card scan',
        });
      }
```

- [ ] **Step 3b: Type-check.** Run `npx tsc --noEmit`. Expected: no new errors in `src/app/api/scan/route.ts`.

- [ ] **Step 4: Verify the existing-member guard is preserved (no guests row for member matches).** Confirm by inspection that, for `matchType === 'existing_member'`, `targetGuestId` stays `null` (the `if (matchType !== 'existing_member' && ...)` guard at L241 is untouched), so Step 2's `if (targetGuestId)` does NOT link a kanban guests row for members. Document: "existing-member match links only the scan row, with `matched_member_id` set and `note='networking touch (existing member)'`, no guests pipeline lead."

- [ ] **Step 5: Smoke-test a no-email scan still links a lead.** This requires `ANTHROPIC_API_KEY`; if unavailable in the dev env, run the equivalent DB-level check instead:
```sql
BEGIN;
INSERT INTO public.business_card_scans (name, company, email)
VALUES ('Scan No Email', 'SNE Co', '') RETURNING id \gset
SELECT public.link_lead('business_card_scans', :'id', NULL, 'Scan No Email', 'SNE Co', NULL, 'card_scan', 'new');
SELECT count(*) AS linked FROM public.lead_links WHERE source_table='business_card_scans' AND source_id=:'id'; -- expect 1
SELECT count(*) AS leads_made FROM public.leads l JOIN public.lead_links ll ON ll.lead_id=l.id
  WHERE ll.source_table='business_card_scans' AND ll.source_id=:'id'; -- expect 1
ROLLBACK;
```
Expected: `linked=1`, `leads_made=1` (an email-less scan gets its own lead).

- [ ] **Step 6: Commit.** Run:
```
git add "src/app/api/scan/route.ts"
git commit -m "feat(scan): link guest + scan rows into one lead funnel; preserve member guard"
```

---

## Task 9 — Wire `/api/guest/submit` (qr_rsvp; attribution from authoritative token)

Link the `intake_guest` + `intake_rsvp` to one lead (`source='qr_rsvp'`), projecting RSVP status onto stage; `invited_by_member_id` flows from the authoritative QR token, not the body. Non-blocking, after the side effects.

**Files**
- Modify: `src/app/api/guest/submit/route.ts` (after the RSVP block; uses `authoritativeInvitedByMemberId` at L76, `guest.id`, `rsvpId`)

**Steps**

- [ ] **Step 1: Add the imports.** In `src/app/api/guest/submit/route.ts`, the import block currently ends:
```ts
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';
import { verifyToken } from '@/lib/guest/tokens';
```
Replace it with:
```ts
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';
import { verifyToken } from '@/lib/guest/tokens';
import { linkLead } from '@/lib/leads/linkLead';
import { mapRsvpStatusToStage } from '@/lib/leads/stage';
```

- [ ] **Step 2: Link both source rows after the conflict-log block, before the magic-link block.** In `src/app/api/guest/submit/route.ts`, the conflict-log block currently ends:
```ts
    if (logErr) console.error('intake_conflict_log insert', logErr);
  }

  // 6) Magic link — preserve the existing one if it's still valid, so prior
```
Replace it with:
```ts
    if (logErr) console.error('intake_conflict_log insert', logErr);
  }

  // 5b) Link the intake_guest + intake_rsvp into the one lead funnel (non-blocking).
  // RSVP status projects onto the canonical stage; attribution comes from the
  // AUTHORITATIVE QR token (tokenRow.invited_by_member_id), never the body.
  {
    const guestStage = mapRsvpStatusToStage('registered');
    await linkLead(sb, {
      source_table: 'intake_guests',
      source_id: guest.id,
      email: p.email.trim(),
      name: `${p.first_name.trim()} ${p.last_name.trim()}`,
      company: p.business_name.trim(),
      source: 'qr_rsvp',
      stage: guestStage,
      invited_by_member_id: authoritativeInvitedByMemberId ?? null,
      matched_member_id: existingMember?.id ?? null,
      note: 'qr rsvp (intake_guest)',
    });
    await linkLead(sb, {
      source_table: 'intake_rsvps',
      source_id: rsvpId,
      email: p.email.trim(),
      name: `${p.first_name.trim()} ${p.last_name.trim()}`,
      company: p.business_name.trim(),
      source: 'qr_rsvp',
      stage: guestStage,
      invited_by_member_id: authoritativeInvitedByMemberId ?? null,
      matched_member_id: existingMember?.id ?? null,
      note: 'qr rsvp (intake_rsvp)',
    });
  }

  // 6) Magic link — preserve the existing one if it's still valid, so prior
```

- [ ] **Step 2b: Type-check.** Run `npx tsc --noEmit`. Expected: no new errors in `src/app/api/guest/submit/route.ts`. (Note: `existingMember` is queried at L105-109 and is in scope; `authoritativeInvitedByMemberId` is defined at L76.)

- [ ] **Step 3: Verify the magic-link row is never deleted by this wiring (red-team #4).** Confirm by inspection that the new block contains zero `delete`/`DELETE` calls and never touches `intake_guests.magic_token_hash`/`magic_expires_at` — it only calls `link_lead`, which is additive. Document: "submit wiring is link-only; the live-magic-link `intake_guests` row is never deleted."

- [ ] **Step 4: Smoke-test that the QR RSVP appears in `v_lead_pipeline` with the inviter.** After a real or scripted submit lands an `intake_rsvps` row with a known `invited_by_member_id`, run:
```sql
SELECT v.email_normalized, v.stage, v.has_qr_rsvp, v.invited_by_member_name
FROM public.v_lead_pipeline v
WHERE v.has_qr_rsvp = true
ORDER BY v.created_at DESC
LIMIT 1;
```
Expected: one row with `has_qr_rsvp=true`, `stage` in (`rsvp`,`attended`), and `invited_by_member_name` matching the QR token's member (or NULL for a general/event QR with no inviter).

- [ ] **Step 5: Commit.** Run:
```
git add "src/app/api/guest/submit/route.ts"
git commit -m "feat(submit): link qr_rsvp into one lead funnel; attribution from token (non-blocking)"
```

---

## Task 10 — Advance the lead to `'attended'` on the RSVP-status PATCH

The small edit the spec calls for: when an admin/director sets an RSVP `status='attended'`, advance the linked lead forward to `'attended'`. Forward-only (`stage_rank`), non-blocking, attributed to the acting profile.

**Files**
- Modify: `src/app/api/admin/intake-rsvps/[id]/route.ts` (PATCH at L13-53; `profile.id` from `requireDirector`, `sb` already in scope)

**Steps**

- [ ] **Step 1: Add the imports.** In `src/app/api/admin/intake-rsvps/[id]/route.ts`, the import block currently reads:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
```
Replace it with:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
import { linkLead } from '@/lib/leads/linkLead';
```

- [ ] **Step 2: After a successful `attended` update, advance the linked lead.** In `src/app/api/admin/intake-rsvps/[id]/route.ts`, the update block currently ends:
```ts
  const { error: upErr } = await sb.from('intake_rsvps').update(update).eq('id', id);
  if (upErr) {
    console.error('intake_rsvps update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
```
Replace it with:
```ts
  const { error: upErr } = await sb.from('intake_rsvps').update(update).eq('id', id);
  if (upErr) {
    console.error('intake_rsvps update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // When marked attended, advance the linked lead forward-only to 'attended'.
  // link_lead is idempotent and re-uses the lead already linked to this rsvp row;
  // non-blocking so a spine hiccup never fails the status update.
  if (parsed.data.status === 'attended') {
    const { data: rsvpRow } = await sb
      .from('intake_rsvps')
      .select('id,guest_id,invited_by_member_id,intake_guests!inner(email,first_name,last_name,business_name)')
      .eq('id', id)
      .maybeSingle();
    const ig = (rsvpRow as unknown as {
      guest_id: string;
      invited_by_member_id: string | null;
      intake_guests: { email: string; first_name: string; last_name: string; business_name: string };
    } | null);
    if (ig) {
      await linkLead(sb, {
        source_table: 'intake_rsvps',
        source_id: id,
        email: ig.intake_guests.email,
        name: `${ig.intake_guests.first_name} ${ig.intake_guests.last_name}`,
        company: ig.intake_guests.business_name,
        source: 'qr_rsvp',
        stage: 'attended',
        invited_by_member_id: ig.invited_by_member_id ?? null,
        actor_profile_id: profile.id,
        note: 'rsvp marked attended',
      });
    }
  }

  return NextResponse.json({ ok: true });
```

- [ ] **Step 2b: Type-check.** Run `npx tsc --noEmit`. Expected: no new errors in `src/app/api/admin/intake-rsvps/[id]/route.ts`. (Note: `profile` from `requireDirector` exposes `.id`, `.role`, `.chapter`, used above and at L27/34.)

- [ ] **Step 3: Smoke-test the PATCH advances the lead to attended.** Pick a real attended-eligible RSVP id (`<rsvp_id>`) and an admin session token (`<jwt>`), then run:
```
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3000/api/admin/intake-rsvps/<rsvp_id> \
  -H 'content-type: application/json' -H 'Authorization: Bearer <jwt>' \
  -d '{"status":"attended"}'
```
Expected HTTP code: `200`. Then verify:
```sql
SELECT l.stage
FROM public.leads l
JOIN public.lead_links ll ON ll.lead_id = l.id
WHERE ll.source_table = 'intake_rsvps' AND ll.source_id = '<rsvp_id>';
```
Expected: `stage='attended'` (or a higher rank if it was already further along — forward-only never regresses).

- [ ] **Step 4: Commit.** Run:
```
git add "src/app/api/admin/intake-rsvps/[id]/route.ts"
git commit -m "feat(rsvp): advance linked lead to 'attended' on status PATCH (forward-only, non-blocking)"
```

---

## Task 11 — Full-funnel verification + non-regression of existing reads

Confirm the slice satisfied the spec's no-orphan and non-blocking invariants and that no existing read changed (`PipelineTab`/`IntakeGuestsTab` still read their current sources).

**Files**
- (Verification only — no file changes)

**Steps**

- [ ] **Step 1: Re-run the full test suite.** Run `npm test`. Expected: all suites pass, including `src/lib/leads/stage.test.ts` and the pre-existing `src/lib/members/summary.test.ts`. Exit code 0.

- [ ] **Step 2: Re-assert 0 unlinked across all sources after the route wiring exercised live writes.** Re-run the 5-table unlinked query from Task 5 Step 3. Expected: every `unlinked = 0`.

- [ ] **Step 3: Confirm existing reads are unchanged this slice.** Run:
```
git diff --name-only HEAD~9 -- src/hooks/useGuests.ts src/hooks/useSignups.ts src/hooks/useIntakeGuests.ts src/components/tabs/PipelineTab.tsx src/components/tabs/IntakeGuestsTab.tsx
```
Expected: NO output (none of these files were modified — `PipelineTab`/`IntakeGuestsTab` keep their current `from('guests')`/`from('intake_rsvps')` reads, and the new `leads` tables back no UI yet).

- [ ] **Step 4: Confirm `link_lead` failure does not block a submit (fault injection).** Temporarily revoke the grant, fire `/api/join`, restore the grant:
```sql
REVOKE EXECUTE ON FUNCTION public.link_lead(TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT) FROM service_role;
```
```
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/join \
  -H 'content-type: application/json' \
  -d '{"name":"Fault Inject","company":"FI Co","email":"fault-inject@example.com"}'
```
Expected HTTP code: `200` (the submit succeeds even though the RPC is denied — `linkLead` swallows the error and logs `link_lead failed (non-blocking)`). Then restore:
```sql
GRANT EXECUTE ON FUNCTION public.link_lead(TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT) TO service_role;
```
Clean up the test signup: `DELETE FROM public.public_signups WHERE email='fault-inject@example.com'; DELETE FROM public.leads WHERE email_normalized='fault-inject@example.com';`

- [ ] **Step 5: Confirm the load-bearing helpers were never altered (red-team #5).** Run:
```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('is_admin','is_chapter_director','get_user_chapter','handle_new_user')
ORDER BY proname;
```
Expected: all four present with their original (zero-arg, except the trigger) signatures — this slice only *calls* them in policies; it never `CREATE OR REPLACE`d them.

- [ ] **Step 6: Final commit if any verification artifact changed.** (Normally no changes here.) If clean, no commit needed; otherwise:
```
git add -A
git commit -m "chore(leads): verification pass — 0 unlinked, non-blocking, reads unchanged"
```

---

## Done when

This workstream is complete when the following spec §8 Go/No-Go checks pass against prod-equivalent data:

- **§8.11 Lead funnel no-orphan** — the 5-table unlinked query returns `0` for every source table (Task 5 Step 3, Task 11 Step 2); a person present in both `intake_guests` and `guests` collapses to exactly one lead (Task 5 Step 4); a QR RSVP appears in `v_lead_pipeline` with `has_qr_rsvp=true` and the correct `invited_by_member_name` from the authoritative token (Task 9 Step 4); and `link_lead` failure does NOT block `/api/join|scan|submit` (Task 7 Step 3, Task 11 Step 4).
- **§8.9 Identity non-destructive (this slice's portion)** — pre/post row counts are identical across `guests`/`public_signups`/`intake_guests`/`intake_rsvps`/`business_card_scans`; the backfill deleted nothing (Task 5 Step 5).
- **§8.10 Helpers untouched** — `is_admin`/`is_chapter_director`/`get_user_chapter`/`handle_new_user` signatures unchanged; the new tables' policies *call* the helpers and add NO anon policy (Task 2 Step 4, Task 11 Step 5).
- **Red-team mitigations satisfied** — additive linkage only via `lead_links UNIQUE(source_table,source_id)` (Task 2 Step 3); `link_lead` is forward-only and idempotent (Task 3 Steps 4-5); the scanner existing-member guard is preserved (Task 8 Step 4); no live-magic-link `intake_guests` row is ever deleted (Task 9 Step 3); and `link_lead` is GRANTed to `service_role` only with no anon/authenticated/public access (Task 3 Step 3).
- **Existing reads unchanged** — `PipelineTab`/`IntakeGuestsTab` and the `useGuests`/`useSignups`/`useIntakeGuests` hooks keep their current reads; `v_lead_pipeline` ships unconsumed (Task 11 Step 3).

**Dependency note:** this plan keys `leads.email_normalized` off `lower(btrim(email))`, consistent with the identity plan's `email_normalized` concept (migration `019`); it does not modify the email-match code path and adds no `member_id` columns to `guests`/`public_signups`/`intake_guests` (lead↔member linkage is owned here via `lead_links` + `leads.invited_by_member_id`/`converted_member_id`, per spec §3.2 reconciliation note).
