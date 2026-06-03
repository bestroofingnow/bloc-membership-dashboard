# BLOC Platform Overhaul — Program Roadmap

**Date:** 2026-06-03
**Owner:** James (BLOC member-admin)
**Status:** Approved roadmap (north-star). Each phase gets its own design spec + implementation plan.

> This is the umbrella plan for a major improvement to the BLOC Membership Dashboard: a UX/UI overhaul plus a full membership-management and new-member lead/growth program that helps the networking group grow, stay organized, follow up, and lets the **whole team** help grow together — **without disrupting existing people, logins, roles, or chapter scoping.**

---

## 1. Goals

1. **Better UX/UI** — one coherent, modern, mobile-first interface (today it feels like "three different apps").
2. **Full membership management** — run members from inside the app (and from a phone), not via laptop-only Python scripts and raw SQL.
3. **A new-member lead/growth program** — one funnel from first touch (QR scan, event RSVP, business card, public application) to approved member.
4. **Follow-up discipline** — owners, next actions, due dates, and an "needs attention" worklist so nothing slips.
5. **Whole-team growth** — every member can personally invite and track their guests; a recruiting leaderboard makes it a shared effort.

## 2. Locked product decisions (2026-06-03)

| Topic | Decision |
|---|---|
| **Wild Apricot** | Dashboard becomes the day-to-day source of truth; keep a reliable **one-way** sync/export to WA during a transition; revisit fully sunsetting WA later. Do **not** deepen two-way sync. |
| **Joining** | **Invite-only** member provisioning + a public **"apply to join"** form that creates a lead/application — never an instant member login. The open self-signup hole is closed. |
| **Directory privacy** | Members browse the **whole network** by name/company/industry; business email/phone visible to members; **home address + birthday hidden unless the member opts in**; directors/admins see full. |
| **Membership model** | A person is in **one active chapter/tier at a time**; chapter changes, After Hours→full, and Alumni all **convert in place** and keep history (no multi-membership). |
| **Team growth** | All four: per-member **personal attributed invite link + "my guests"**; **in-dashboard follow-up** (owner/next-action/due/aging); **push leads to GoHighLevel** for email/SMS; **recruiting leaderboard**. |
| **Sequencing** | Balanced — foundation-led with early visible wins. |

## 3. Hard constraints — must NOT break

Identity is Supabase `auth.users` ↔ `profiles` (by `id = auth.uid()`). Every change is **additive and independently shippable**. Specifically preserve:

- The `handle_new_user` trigger, `AuthGuard` branch order (loading → demo → login → deactivated → force-password → app), and `must_change_password`.
- The three `SECURITY DEFINER` helpers `is_admin()` / `is_chapter_director()` / `get_user_chapter()` (migration 005) — load-bearing for write policies across ~10 tables.
- The `members` ↔ `profiles` email-match contract (used by My Profile + `/api/me/roster-visibility`) **until** a real FK replaces it and is verified.
- `member_type` default `'full'`, `chapter` nullable **only** for After Hours; `summarizeMembers` keeps After-Hours/null-chapter members out of chapter buckets and the 125 goal.
- `chapter_member_visibility` columns + its anon `visible=true` SELECT policy and `events.public_visible` anon read (power the public guest wizard); `UNIQUE(member_id,chapter)` and `UNIQUE(guest_id,event_id)`.
- Signed-QR token format + `GUEST_TOKEN_SECRET`, `/guest/i/<token>`, `qr_token_bump_scan` RPC, magic cookies, and `ics_uid` stability (already-printed QR codes must keep resolving).
- `#hash` tab IDs (deep-link contract) and the role-gating `useMemo` shape in `page.tsx`.

⚠️ **Two silent traps to respect throughout:** (1) `useMembers`/`useGuests` fall back to **hardcoded static PII** on a zero-row result, so any over-tightened read shows *fabricated* data instead of erroring — every reader must be audited and verified against real data. (2) There are **two conflicting `events` table definitions** (003 WA vs 010 guest-flow); reconcile before building on either.

## 4. The phased roadmap

Each phase is shippable on its own and never breaks existing users.

### Phase 0 — Stabilize & polish (guardrails + visible cleanup)
Close the open public-signup hole; add Bearer-JWT auth to the `/api/wa/*` routes; **hide Most Wanted + Guest Pipeline from plain members** (admin/director only) and gate the Scanner's invite action; fix the kanban `slice(0,6)` bug hiding "Application Received"/"Approved"; regenerate `database.types.ts` and remove `row:any`; promote `scripts/sql/03_scanner_enhancements.sql` to a numbered migration; replace silent static-data fallbacks with explicit empty states; replace native `confirm()`/`prompt()` with the styled `Modal` and unify Login/Profile/Roster onto the card UI; ARIA tab semantics + `next/font`; consistent password policy. **Risk: low — pure tightening + polish.**

### Phase 1 — Identity & one lead funnel (the spine)
One record per human with stable FKs (replacing the fragile email match, with a safe transition); **merge the three lead stores into one funnel** with a shared status timeline (scan / RSVP / card / application → attended → applied → approved → member) and route the card scanner into it; **additive RLS** so members read business info network-wide while personal PII is opt-in, directors are read-scoped, role/chapter self-edit is locked, and directors can read their chapter's QR tokens. **Foundational — everything later depends on it.** Risk managed via backfill-without-orphaning, feature flags, and a full login/role/real-data verification pass.

### Phase 2 — Re-platform the UX
Role-aware **grouped navigation** (sidebar on desktop, bottom-bar on mobile) replacing the 15-tab strip; **responsive cards instead of tables** on the data-dense screens; a branded, mobile-friendly public guest wizard + branded emails + timezone-correct (`America/New_York`) calendar invites. Preserve `#hash` deep-links and role gating exactly.

### Phase 3 — Follow-up & team growth
Per-lead **owner + next action + due date + aging "needs attention" worklist** with reminders and ambient overdue badges; **every member's personal invite link + "my guests"** with RSVP status; **recruiting leaderboard**; reliable **GoHighLevel push** with automatic side-effect retry. Purely additive surfaces.

### Phase 4 — In-app membership management (retire the scripts)
Invite-only provisioning + **CSV import** + phone-friendly onboarding (temp password / magic link); applications queue; member editing incl. industry taxonomy as the single source of truth; **hardened one-way WA sync**; live dashboard + an admin Settings UI for goals/impact/lunch URLs (incl. the missing Alumni link).

## 5. Cross-cutting principles

- **Additive & flag-gated:** new tables/columns/policies are added alongside the old; cutovers happen behind flags after verification; old paths are removed only once the new path is proven.
- **Verify against real data:** because of the fabricated-data fallback, "it rendered" is not proof — confirm real rows load and counts match before/after every data change.
- **Tests as the safety net:** add role-scope/RLS and data-hook tests (today only pure `src/lib` helpers are covered) before refactors touch login/scoping code.
- **One design system:** converge the duplicated UI (cards vs raw tables / native dialogs) onto the existing `Card`/`Input`/`Modal`/`Badge` primitives; retire the drifting `@layer` duplicates in `globals.css`.

## 6. Process

Each phase: **design spec → implementation plan → build → verify → ship.** The first buildable spec covers **Phase 0 + Phase 1 together** (Phase 0 sets the guardrails Phase 1 relies on) — see `2026-06-03-foundation-phase0-1-design.md`.

## 7. Source

Grounded in a full subsystem audit of the codebase at `/Users/jamesturner/ALL apps and downloads/bloc-membership-dashboard` (2026-06-03): 8-agent subsystem map + synthesis, then a 4-fragment grounded design + adversarial red-team of Phase 0/1.
