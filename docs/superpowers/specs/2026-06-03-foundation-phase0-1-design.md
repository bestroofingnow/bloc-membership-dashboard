# Foundation — Phase 0 + Phase 1 Design Spec

**Date:** 2026-06-03
**Program:** [BLOC Platform Overhaul](2026-06-03-platform-overhaul-program.md)
**Scope:** The first buildable unit — Phase 0 (stabilize & polish) + Phase 1 (unified identity, one lead funnel, additive access control). Each item below is independently shippable and **additive**; nothing breaks existing logins, the three roles, chapter scoping, existing data, or already-printed QR codes.
**Status:** Draft for owner review.

---

## 1. Guiding principles

1. **Additive & staged.** New columns/tables/policies/functions are added alongside the old. Cutovers happen behind a flag or as a paired client change, and old paths are removed only after the new path is verified.
2. **The anti-fabrication invariant (most important).** `useMembers` (`src/hooks/useMembers.ts:33,54`) and `useGuests` (`src/hooks/useGuests.ts:43,64`) **silently fall back to hardcoded PII** (`src/data/members.ts`, `src/data/guests.ts`) when a read returns **zero rows**. Therefore: **(a)** Phase 0 removes that silent fallback *first* (item P0-g); **(b)** no read policy is ever tightened in a way that can return zero rows to a live reader — column narrowing is done by a `SECURITY DEFINER` projection that returns the **same row count**, never by removing rows. Every data change is verified against a real DB-only "fingerprint" record.
3. **Never touch the load-bearing spine.** The three `SECURITY DEFINER` helpers `is_admin()` / `is_chapter_director()` / `get_user_chapter()` (migration `005`), the `handle_new_user` trigger (`001:97-115`), and the `AuthGuard` branch order are reused verbatim, never dropped or altered. New policies **call** the helpers (never inline `EXISTS`-on-profiles, which would re-trigger the recursion `005` fixed).
4. **Public/anon paths are service-role.** The public guest wizard and `/api/join`, `/api/guest/submit`, `/api/scan` all write via the service-role key, which **bypasses RLS** — so tightening authenticated read policies does not affect the public flow. New lead tables get **no anon policy**.
5. **Preserve printed-QR integrity.** `GUEST_TOKEN_SECRET`, the HMAC token shape, `/guest/i/<token>`, the `qr_token_bump_scan` RPC, magic cookies, and `ics_uid` are out of scope and untouched.

---

## 2. Phase 0 — Stabilize & polish

All low/medium risk, no change to the auth/RLS spine.

| ID | Item | Key files | Change | Risk |
|---|---|---|---|---|
| **P0-a** | Close the open self-signup hole | `src/components/auth/LoginForm.tsx` (Mode type L13; toggle L259-271), `src/contexts/AuthContext.tsx` (`signUp` L165-198) | Remove the in-app `'signup'` mode; replace the "Sign up" toggle with an anchor to the existing public `/join` apply-to-join page. Make `AuthContext.signUp` a **guard** returning `{ error: 'Self-signup is disabled. Apply at /join.' }` (keep the method on the interface — narrower blast radius). `handle_new_user` stays intact (admin-provisioned accounts still need it). | low |
| **P0-b** | Auth the three `/api/wa/*` routes | `src/lib/api/auth.ts` (new shared `requireAdmin(req)`), `src/app/api/wa/{sync-members,sync-events,push-member}/route.ts`, `src/hooks/useWildApricot.ts` (L77,101,125) | These POSTs currently have **zero auth** (anyone can trigger a full WA pull/push). Add Bearer-JWT verification → require `role='admin'` (WA sync is org-wide) → else 401/403. Thread `Authorization: Bearer <session.access_token>` from `useWildApricot`. **One shared helper** module so this and the field-visibility routes don't diverge. | medium |
| **P0-c** | Hide the recruitment funnel from plain members | `src/app/page.tsx` (baseTabs L58-66; useMemo L106-129), `src/components/tabs/ScannerTab.tsx` (`canInvite` L377) | Move **Most Wanted** (`targets`) and **Guest Pipeline** (`pipeline`) out of the member-visible `baseTabs` into the `isAdmin || isDirector` block, keeping their `#targets`/`#pipeline` ids. Gate the Scanner "Invite to event" panel behind `isAdmin || isDirector`. The role-gating `useMemo` shape and `#hash` deep-links are preserved exactly. (Defense-in-depth; the invite API already enforces `requireDirector`.) | medium |
| **P0-d** | Fix the kanban stage-hiding bug | `src/components/tabs/PipelineTab.tsx` (L323; grid L404) | `slice(0,6)` silently hides stages `'Application Received'` and `'Approved'` — guests in those stages vanish. Render all 8 stages; adjust grid to `lg:grid-cols-4 xl:grid-cols-8`. | low |
| **P0-e** | Regenerate `database.types.ts`, thread `Database` type | `src/lib/database.types.ts`, `src/lib/supabase.ts` (L10), `src/hooks/*` (`row: any`) | Current types are stale (missing `member_type`, nullable chapter, scanner/intake/qr/rsvp/visibility tables) and imported nowhere. Regenerate from the live schema (project `ksmtkisknnvrjdfigsll` — confirm current); `createClient<Database>`; replace `row: any` in `useMembers`/`useGuests`. Ship as its own PR (type-only, surfaces latent errors). | medium |
| **P0-f** | Promote scanner SQL to a numbered migration | new `supabase/migrations/017_scanner_enhancements.sql` | `/api/scan` writes `scanned_by_profile_id, target_guest_id, target_member_id, email_normalized` (L286-289) but those columns only exist via the **unnumbered** `scripts/sql/03_scanner_enhancements.sql` — the scanner 500s on any env where it wasn't pasted. Copy verbatim (already idempotent; FKs `ON DELETE SET NULL`). | low |
| **P0-g** | Remove the silent static-PII fallback | `src/hooks/useMembers.ts` (L33,54-57), `src/hooks/useGuests.ts` (L43,64-67), `src/lib/supabase.ts` | Add `isDemoMode()` (`NEXT_PUBLIC_DEMO_MODE==='true'`, default **off**). Initialize state with `[]` when configured; on a zero-row result set `[]` and render an explicit empty state. Use the static seed **only** when `!isConfigured || isDemoMode()`. **This is the prerequisite for any read tightening.** | medium |
| **P0-h** | Reconcile the duplicate `events` table | new `supabase/migrations/018_events_reconcile.sql` | `003_wildapricot.sql:15` and `010_intake_events.sql:4` both `CREATE TABLE IF NOT EXISTS events` with **disjoint columns**; whichever ran first wins, the other is a silent no-op (`qr_tokens.event_id`, `intake_rsvps.event_id` FK into it). Inspect the live (prod) schema; ship a migration that `ADD COLUMN IF NOT EXISTS` the missing columns so `events` is a documented **superset** (keep `010`'s `title/starts_at/ends_at/ics_uid/public_visible` + add nullable `wa_event_id/registration_url`). Pin the canonical definition so fresh rebuilds match prod. | medium |
| **P0-i** | UX polish: styled confirms, a11y, fonts, password copy | `src/components/ui/Modal.tsx` (focus-trap/autoFocus), six tabs with native `confirm()` (EventsTab L115, RosterTab L72, MyProfileTab L128, MemberTaxonomyTab L52/93, QrTokensTab L134), `src/app/page.tsx` nav (L246-270), `src/app/layout.tsx`, `LoginForm.tsx` L68, `ChangePasswordModal.tsx` L19/46/89 | Replace native `confirm()`/`prompt()` with the styled `Modal` (+ focus trap, `autoFocus`, Escape already handled); `role=tablist/tab/tabpanel` + `aria-selected` on the nav; `next/font`; unify Login/Profile/Roster onto `Card`/`Input`. Bump password min 6→8 consistently; change the misleading "Welcome to BLOC!" force-password heading to "Set a New Password". | low |
| **P0-j** | Fix migration `008` stray token | `supabase/migrations/008_must_change_password.sql` (L5) | A stray `did` token after the `ALTER TABLE` is harmless on already-migrated prod but breaks a clean `db reset`. Remove it so rebuilds are reproducible. | low |

---

## 3. Phase 1 — Unified identity (the spine)

**Goal:** one durable link per human (`auth.users` ↔ `profiles` ↔ `members`) replacing the fragile case-insensitive email match — **without changing the email-match code path in this slice** (FKs are populated *alongside* it; the reader cutover is a separate, reversible slice).

### 3.1 Schema (migration `019_identity.sql`)
- `members.email_normalized` — `GENERATED ALWAYS AS (NULLIF(lower(btrim(email)),'')) STORED` (blank/NULL never collide). Add a **plain** index first; promote to a partial `UNIQUE` index **only after** `identity_link_audit` shows zero duplicates.
- `profiles.member_id UUID REFERENCES members(id) ON DELETE SET NULL` and `members.user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` — reciprocal, nullable, `ON DELETE SET NULL` (matches the deactivation contract: deleting a profile must **not** cascade-delete the member row). Unique index on `members.user_id WHERE user_id IS NOT NULL`.
- `identity_link_audit` **admin-gated** view surfacing `dup_member_email`, `profile_no_member`, `member_no_user` (exposes emails — restrict to admin, never anon/member).

### 3.2 Backfill (in `019`, idempotent, guarded by `IS NULL`)
- `profiles.member_id ← members` by normalized email **only when exactly one member matches** (avoids mis-linking duplicates); reciprocally set `members.user_id`. Unmatched rows stay NULL (a login with no roster row, or a member with no login) — nothing deleted.

### 3.3 Member status & history (migration `021_member_status_history.sql`)
- `members.member_status TEXT NOT NULL DEFAULT 'active' CHECK (member_status IN ('active','alumni','inactive'))` — `'active'` default preserves every existing row; `member_type` (`full`/`after_hours`) is unchanged.
- `member_history` append-only audit table (`change_kind`, from/to chapter/type/status, `changed_by`, `changed_at`), `ON DELETE CASCADE` from `members`, `changed_by` `ON DELETE SET NULL`. RLS enabled; read admin/director via `005` helpers, write admin-only.
- **Convert-in-place:** chapter change, After Hours→full, and Alumni all mutate the single `members` row and append a `member_history` event — one active membership per person, full audit trail.

### 3.4 Forward-fill triggers (in `021`)
- A **separate** `AFTER INSERT` trigger on `profiles` (do **not** modify `handle_new_user`) that sets `member_id` from a single email match, and reciprocally sets `members.user_id`; a matching trigger on `members`. Both `SECURITY DEFINER`, idempotent (`IS NULL` guards), order-tolerant for the invite-provisioning race.

### 3.5 Transition (separate later slice, not this one)
- Cut `useMyMember` and `/api/me/roster-visibility` to **FK-first, email-fallback** (`members.user_id = session.user.id`, else the existing `ilike(email)`). Remove the email branch only in a third slice, after `identity_link_audit` is clean for active users.

> **Reconciliation note:** lead↔member linkage is owned by the **lead-funnel spine** (§4, via `lead_links` + `leads.invited_by_member_id`/`converted_member_id`), so this workstream does **not** add `member_id` columns to `guests`/`public_signups`/`intake_guests` — avoiding two competing mechanisms.

---

## 4. Phase 1 — One lead funnel (migration `022_lead_funnel.sql`)

**Goal:** the three disjoint lead stores (`guests` kanban, `public_signups`, `intake_guests`/`intake_rsvps`) plus the card scanner feed **one** lead model with a shared timeline, keyed off `email_normalized`. **Additive over the existing tables** — a thin spine, no data migrated *out*, nothing orphaned.

### 4.1 Tables
- **`leads`** — one row per person, `email_normalized TEXT UNIQUE` (nullable, so scanner "no-email" and handwritten leads never break); `source` enum (`public_signup|qr_rsvp|card_scan|manual|import`); **attribution** `invited_by_member_id`; **follow-up** `owner_profile_id`, `next_action`, `next_action_due` (powers Phase 3); canonical `stage` (`new|rsvp|attended|applied|approved|member|declined`); `matched_member_id`, `converted_member_id`, `ghl_contact_id`.
- **`lead_links`** — polymorphic glue mapping each existing source row (`guests|public_signups|intake_guests|intake_rsvps|business_card_scans` + `source_id`) to its lead. `UNIQUE(source_table, source_id)` → every source row links exactly once; backs idempotent upserts. *This is the no-orphan mechanism — source rows stay in their own tables.*
- **`lead_status_events`** — append-only shared timeline (which source/actor caused each transition).

### 4.2 Functions & view
- `stage_rank(text)` immutable helper (new=0…member=5, declined=9) for **forward-only** transitions.
- `link_lead(...)` `SECURITY DEFINER` RPC — the single idempotent entry point: find-or-create lead by email, enrich blanks only (never clobber human-edited fields), link the source row (`ON CONFLICT DO NOTHING`), append a timeline event, advance stage forward-only. `GRANT EXECUTE` to `service_role` only.
- `v_lead_pipeline` staff-only view with `has_qr_rsvp/has_scan/has_application/has_kanban_card`, `invited_by_member_name`, `is_overdue` — for the eventual single board. **Not consumed by any UI this slice** (existing tabs keep their current reads), so it ships independently.

### 4.3 RLS
- `ENABLE ROW LEVEL SECURITY` on all three; read+write `USING (is_admin() OR is_chapter_director())` via the `005` helpers; **no anon policy**. Public writers use the service role. Members get zero rows cleanly (no error, no PII firehose — and these are *new* tables, so no fabrication risk).

### 4.4 Writer wiring (non-blocking — wrapped in try/catch so a spine hiccup never blocks a real submit)
- `/api/join` → after the `public_signups` insert, `link_lead(... source='public_signup', stage='applied' ...)`. **Stays lead-only** (never `'member'`), honoring invite-only.
- `/api/scan` → link both the new/existing `guests` row and the `business_card_scans` row to one lead (`source='card_scan'`); for an existing **member** match, record a networking-touch event with `matched_member_id` but **no** pipeline lead (preserves the scanner's existing-member guard).
- `/api/guest/submit` → link the `intake_guest` + `intake_rsvp` to one lead (`source='qr_rsvp'`), projecting RSVP status onto `stage`; `invited_by_member_id` flows from the **authoritative QR token** (the attribution that powers Phase 3's personal-invite/leaderboard). A later small edit to the RSVP-status PATCH advances the stage to `'attended'`.

### 4.5 Backfill (idempotent, guarded by a `dashboard_settings` sentinel)
One lead per distinct `email_normalized` across all sources, strongest-identity-first (`intake_guests` → `guests` → `public_signups` → `business_card_scans`); email-less rows get their own lead so nothing is dropped; every source row gets a `lead_links` row (verification asserts **0 unlinked** per table). `map_kanban_stage()` projects the 8 legacy statuses onto the canonical ladder; `guests.status` keeps full granularity regardless.

---

## 5. Phase 1 — Additive RLS & access control

**Goal:** members browse the **whole network** by business info; personal PII is opt-in; members cannot self-edit role/chapter; directors can read their chapter's QR tokens. **Row counts never drop for any reader** (column narrowing only) so the static fallback never fires.

### 5.1 Per-field opt-in (migration `023_member_field_visibility.sql`)
`member_field_visibility (member_id PK, show_mobile_phone, show_address, show_birthday DEFAULT FALSE, updated_by, updated_at)`. Absence of a row = all hidden (the desired default). Booleans only (no PII) → `SELECT USING(true)` for authenticated; writes only via service-role API.

### 5.2 Directory projection (migration `024_member_directory.sql`)
- `directory_members()` `SECURITY DEFINER` function returning **every** member row with business fields always present (`name, company, chapter, member_type, industry, title, website, business_email, business_phone`) and personal fields (`mobile_phone, address, birthday`) **non-null only** when caller is admin/director, is the **owner** (`lower(email)=current_user_email()`), or the member opted that field in.
- `current_user_email()` `SECURITY DEFINER` helper (owner self-view).
- `member_directory` view over the function; `GRANT` to authenticated. **Returns the same row count as the base table**, so `useMembers`' `data.length>0` guard holds.

### 5.3 Staged read tightening (the only "tightening" — done safely in 3 steps)
- **STEP A (now):** leave the blanket `members` `USING(true)` SELECT in place (additive only).
- **STEP B (paired client change, same PR):** point `useMembers` at `member_directory` and map columns. Same row count → no fabrication.
- **STEP C (deferred migration `027`, gated):** only after **every** `from('members')` reader is confirmed admin/director-gated or moved to the directory/owner path, `DROP` the blanket policy and add `members_select_self_and_staff` (`is_admin() OR is_chapter_director() OR lower(email)=current_user_email()`). **Do not ship STEP C until the reader audit (below) is green.**

### 5.4 Self-edit lock (migration `025_profiles_self_edit_lock.sql`)
Replace the `Users can update own profile` policy so the `WITH CHECK` pins `role` and `chapter` to their current values (member can edit `full_name`, clear `must_change_password`, but **cannot self-promote**). The `Admins can manage all profiles` policy (`005`) is untouched → admin role management still works. If the self-referencing subquery shows any recursion on the live instance, add a `get_user_role()` `SECURITY DEFINER` helper (mirroring `get_user_chapter`) — additive, leaves the existing three helpers untouched.

### 5.5 Director QR read (migration `026_qr_tokens_director_read.sql`)
Add `qr_tokens_director_read` (`is_chapter_director() AND (chapter = get_user_chapter() OR chapter IS NULL)`), matching the client filter in `useQrTokens` (which returns **zero** rows for directors today). Admin policy untouched; RLS is OR-combined so this only **adds** rows.

### 5.6 Field-visibility write API
Extend/add `src/app/api/me/field-visibility/route.ts` reusing the exact bearer→`getUser`→email-match→service-role-upsert pattern from `roster-visibility`. Admin/director edits of another member's flags go through an admin route with an explicit `is_admin/is_chapter_director` check. No browser anon write surface.

---

## 6. Canonical migration sequence (resolves the number collisions)

The four design fragments each independently proposed `017`+. The reconciled order:

| # | Migration | Workstream | Notes |
|---|---|---|---|
| `017` | `scanner_enhancements` | P0-f | verbatim promote of `scripts/sql/03` |
| `018` | `events_reconcile` | P0-h | superset of `003`+`010` `events` |
| `019` | `identity` | §3 | `email_normalized`, `profiles.member_id`/`members.user_id`, backfill, `identity_link_audit` |
| `020` | *(reserved)* | — | identity reader-cutover slice (separate PR) |
| `021` | `member_status_history` | §3.3-3.4 | `member_status`, `member_history`, forward-fill triggers |
| `022` | `lead_funnel` | §4 | `leads`/`lead_links`/`lead_status_events`/`link_lead`/`stage_rank`/`v_lead_pipeline`/RLS/backfill |
| `023` | `member_field_visibility` | §5.1 | per-field opt-in |
| `024` | `member_directory` | §5.2 | projection RPC + view |
| `025` | `profiles_self_edit_lock` | §5.4 | role/chapter self-edit lock |
| `026` | `qr_tokens_director_read` | §5.5 | additive director read |
| `027` | `members_select_tighten` | §5.3 STEP C | **gated** — only after reader audit green |

Plus the in-place fix to `008` (P0-j). Migration `020` is intentionally reserved for the identity reader-cutover so its number stays adjacent.

---

## 7. Red-team — ranked breaking risks & required mitigations

From the adversarial review (verified against the code):

| # | Risk | Sev | Trigger | Required mitigation |
|---|---|---|---|---|
| 1 | **Tightened read → fabricated PII shown as real** | Critical | Any `members`/`guests` read change returning 0 rows | Do P0-g (remove fallback) **first**; narrow by column-nulling projection (same row count), never by removing rows; verify the fingerprint record (below) per role before STEP C. |
| 2 | **Identity FK backfill mis-links / orphans** | High | Backfilling `member_id` by email with duplicate/case-variant emails | Backfill **only on exactly-one-match**; run `identity_link_audit` and resolve `dup_member_email` **before** any unique index; keep FK nullable; keep email-match path live. |
| 3 | **Ambiguous `events` schema** | High | Any events write / fresh rebuild | P0-h first: pin the live schema as a documented superset; no events-dependent work before it. |
| 4 | **Lead merge orphans legacy/live rows** | High | Destructive dedup, or deleting a live-magic-link `intake_guests` | Additive linkage only (`lead_links`), never delete source rows; never delete an `intake_guests` row with `magic_expires_at > now()`; respect `UNIQUE(guest_id,event_id)`. |
| 5 | **Touching helpers/trigger/AuthGuard** | Critical (if touched) | `CREATE OR REPLACE` changing a helper signature, editing the trigger, reordering AuthGuard | Don't. New policies **call** existing helpers; new triggers are **separate** and `IS NULL`-guarded. |
| 6 | **Printed QR stops resolving** | High | Rotating `GUEST_TOKEN_SECRET`, changing token shape, deleting `qr_tokens`, renaming the bump RPC | All out of scope; freeze them; add the printed-QR resolve to Go/No-Go. |
| 7 | **Read policy lands before readers migrated** | Medium | Flipping a `members` policy while a reader still expects `USING(true)` breadth | Enumerate all `from('members')` readers; migrate/verify each in the **same** release as STEP C. |
| 8 | **New profile-FK with wrong delete rule** | Medium | Adding `members.user_id`/`profiles.member_id` without `ON DELETE SET NULL` | All new profile/member FKs are `ON DELETE SET NULL`; test: deactivating a linked profile leaves the member row intact. |
| 9 | **Counts / 125 goal drift** | Medium | `member_status`/`member_type` backfill or hidden rows | `member_status` defaults `'active'`; snapshot counts before/after; treat any delta as a regression. |
| 10 | **`008` stray token** | Low | Clean `db reset` | P0-j. |

**Required sequencing within Phase 0+1:** P0-h, P0-j, and the identity/dup-email reconnaissance + baseline snapshots come first → **P0-g (remove fallback)** → identity `019`/`021` (FKs nullable, email path live) → lead funnel `022` (additive linkage) → field-visibility/directory `023`/`024` → self-edit lock `025` + director QR `026` → **only then**, after the reader audit is green, STEP C `027`. Feature-flag: (a) any `members`/`guests` read-policy change, (b) any code that reads the new identity FK, (c) any unified-pipeline UI. Additive nullable columns and write policies ship without flags.

---

## 8. Go / No-Go verification plan

Run all before declaring Phase 0+1 done (each maps to a risk/invariant):

1. **Login works (all 3 roles)** — admin, chapter_director, member each pass `AuthGuard` to the app; `handle_new_user` still creates a `role='member'` profile on a throwaway signup.
2. **`must_change_password`** still gates and clears; heading reads "Set a New Password".
3. **Tabs per role** match the baseline; `#hash` deep-links resolve; Most Wanted/Pipeline absent for members, present for director/admin.
4. **Director still chapter-scoped** — can update own-chapter member, cannot update another chapter's.
5. **Real data, not fabricated (the key check)** — seed a **fingerprint** member + guest that exist only in the DB (absent from `src/data/*`). Each role sees the fingerprint. After P0-g, an over-tightened read shows an **empty state**, never the static list.
6. **Printed QR still resolves** — a real prior `/guest/i/<token>` verifies, finds its `qr_tokens` row, bumps scan, sets the session cookie, advances the wizard; `GUEST_TOKEN_SECRET` byte-identical.
7. **Public wizard anon reads intact** — logged-out, `events_public_read` and `cmv_public_read_visible` still return rows.
8. **Counts / 125 goal unchanged** — `fullMemberCount`, `afterHoursCount`, per-chapter counts identical to the Phase-0 snapshot; After Hours/null-chapter still excluded.
9. **Identity non-destructive** — pre/post row counts identical across `members/profiles/guests/public_signups/intake_guests`; `identity_link_audit` shows 0 `dup_member_email` before any unique index; every member that resolved via the old `ilike` path still resolves; deactivating a linked profile leaves the member + history intact.
10. **Helpers untouched** — `\df is_admin is_chapter_director get_user_chapter` signatures identical to `005`; no new policy inlines a `profiles` self-select; WA routes return 401 (no token) / 403 (member) / 200 (admin).
11. **Lead funnel no-orphan** — `0` unlinked rows per source table; a person across `intake_guests` + `guests` maps to exactly one lead; a QR RSVP appears in `v_lead_pipeline` with `has_qr_rsvp=true` and the correct `invited_by_member_name`; `link_lead` failure does not block `/api/join|scan|submit`.

**Go = all pass against prod-equivalent data, with the fingerprint visible (check 5) and counts identical (check 8). Any read-policy flip that cannot demonstrate check 5 is an automatic No-Go.**

---

## 9. Out of scope (deferred to later phases)

The reader cutover for `useMyMember`/`roster-visibility` (slice after `019`); the single unified pipeline board UI consuming `v_lead_pipeline` (Phase 2/3); follow-up worklist UI, reminders, leaderboard, member personal-invite surfaces (Phase 3); GHL push consolidation onto `leads.ghl_contact_id` (Phase 3); the new navigation shell and responsive card redesign (Phase 2); in-app provisioning/CSV import (Phase 4). Phase 0+1 lays the schema + safety + access foundations these ride on.

---

## 10. Open decisions & assumptions (please confirm)

1. **Mobile phone classification.** **Decided (2026-06-03):** `mobile_phone` is a **personal** field — hidden unless the member opts in, alongside home address + birthday. Business email and business phone stay always-visible to members.
2. **Alumni representation.** **Assumption:** introduce `member_status='alumni'` (keeping the person's prior chapter and history) as the forward-looking model, while the existing `chapter='Alumni'` rows keep working unchanged this slice; the 125-goal/chapter-count semantics for Alumni are revisited in a later slice (no count change now).
3. **April After Hours import.** **Assumption:** in production the `guests` table is already non-empty (the static fallback is inactive), so those ~29 people are real rows and flow into the funnel normally; the one-time seed script is only for a clean/empty environment. *Confirm prod `guests` is non-empty.*
4. **Duplicate member emails / email-less guests.** Resolved operationally via `identity_link_audit` (members) and a human-reviewed `(name, company)` pass (email-less guests) before any uniqueness is enforced.
5. **Stage granularity.** The unified `leads.stage` collapses the 8 kanban stages to 7 (After Hours Invited→`rsvp`, both Lunch stages→`attended`); `guests.status` keeps full granularity. *Confirm the collapsed view is acceptable.*
