# What's Implemented

A pragmatic inventory of every surface in the BLOC dashboard as it stands today. Read this when onboarding, or before you ask "do we already have…?".

---

## Public flow (no auth)

| Route | What it does |
|---|---|
| `/guest` | Lists upcoming events read-only. Tells visitors to scan a QR or ask a member for an invite link. |
| `/guest/i/<token>` | QR landing. Verifies signed JWT, shows chapter / event / inviter context, sets wizard session cookie. |
| `/guest/i/<token>/event` | Event picker (skipped if token pinned an event). |
| `/guest/i/<token>/chapter` | Public roster preview — visible members of the chapter as a trust-builder. |
| `/guest/i/<token>/details` | Form: name, email, business, Industry → Category, soft-warn conflict panel live-updates. |
| `/guest/i/<token>/confirm` | Confirmation screen with ICS download + inviter thank-you. RSVP cookie-bound. |
| `/guest/me` | Magic-link return page. Lists guest's RSVPs. |
| `/guest/error/[code]` | Friendly error pages for bad/expired links. |
| `/join` | Legacy public signup form (pre-dates sub-project A). |
| `/robots.txt` | Excludes signed-token URLs from search indexes. |
| `/sitemap.xml` | Lists 3 truly-public routes. |

## Server routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | none | Uptime probe. 200 if DB reachable. |
| `/api/guest/check-conflict` | GET | none | Live conflict lookup for the form, rate-limited 30/min/IP. |
| `/api/guest/submit` | POST | none | RSVP submission, rate-limited 5/min + 20/hr/IP. Validates JWT, server-side conflict re-check, idempotent. |
| `/api/guest/ics/[rsvp]` | GET | cookie | Download ICS — requires `intake_recent_rsvp` or `intake_guest_id` cookie. |
| `/api/guest/magic` | GET | none | Magic-link exchange → sets `intake_guest_id` cookie. |
| `/api/guest/magic/refresh` | POST | none | Email a fresh magic link, no enumeration (always 200). |
| `/api/guest/dev/mint` | POST | dev-only | Hidden in prod and behind `ENABLE_DEV_MINT=true` elsewhere. |
| `/api/admin/intake-rsvps/[id]` | PATCH | director/admin | Status changes on a guest RSVP. |
| `/api/admin/intake-side-effect/[id]/resolve` | POST | director/admin | Mark sync failures resolved. |
| `/api/admin/events` | POST | director/admin | Create event (chapter-scoped for directors). |
| `/api/admin/events/[id]` | PATCH/DELETE | director/admin | Edit / visibility / delete (delete refused if RSVPs exist). |
| `/api/admin/qr-tokens` | POST | director/admin | Mint signed QR. |
| `/api/admin/qr-tokens/[id]` | PATCH | director/admin | Revoke / restore / re-label. |
| `/api/admin/chapter-visibility` | POST/DELETE | director/admin | Upsert / clear roster overrides for any member. |
| `/api/admin/members/[id]/taxonomy` | PATCH | admin | Set member's industry_id / category_id (admin only — global decision). |
| `/api/me/roster-visibility` | POST | any member | Self-service: toggle own visibility on own chapter roster. |
| `/api/join` | POST | none | Legacy signup. |
| `/api/scan/*`, `/api/wa/*` | — | — | Pre-existing card scanner + Wild Apricot routes. |

All admin routes verify a Bearer JWT against Supabase via `requireDirector()` in `src/lib/admin-auth.ts` and enforce chapter scope for directors.

## Dashboard tabs (auth-gated)

Grouped into Membership / Guest Flow / You / Admin. Members see the first + last group; Directors add Guest Flow; Admins add the Admin group.

### Membership (visible to all roles)

- **Dashboard** — KPI tiles, chapter progress, recent guests
- **Leadership** — board directory
- **Members** — roster directory
- **Most Wanted** — recruitment targets
- **Guest Pipeline** — existing kanban
- **Card Scanner** — business card scanner
- **Membership Guide** — onboarding doc

### Guest Flow (director + admin)

- **Guest Inbox** — every public-flow RSVP, filterable (status, conflict, search, needs-attention preset), per-row status dropdown, sync-failure resolve, CSV export, realtime
- **Events** — CRUD events that feed the public flow; visibility toggle, delete with RSVP guard
- **QR Codes** — mint/label/revoke any of 5 kinds (general/chapter/event/member-invite/after-hours); client-side QR render (no third-party calls), copy URL, PNG download, print sheet
- **Roster** — per-member visibility toggle + public business-name / category overrides
- **Category Seats** — visualize open/occupied/multi seats per chapter × industry × category; CSV export

### You (all roles)

- **My Profile** — read-only member info; self-service visibility toggle; clear director-set overrides

### Admin (admin only)

- **Member Taxonomy** — backfill industry_id / category_id with fuzzy-matched suggestions from legacy text; bulk-apply
- **Admin** — pre-existing user mgmt + Wild Apricot

## Cross-cutting

- **Toast feedback** on every mutation (success / error)
- **Cmd/Ctrl+K palette** for jumping to any tab
- **URL hash routing** — refresh keeps you on the same tab; deep-linkable (`#intake`)
- **Browser title** reflects active tab
- **Back-to-top** floating button on long pages
- **Error boundary** (`src/app/error.tsx`) catches runtime crashes
- **404 page** (`src/app/not-found.tsx`)
- **Security headers** via `next.config.js` (HSTS, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy)
- **Realtime subscriptions** on intake_rsvps, side_effect_failures, events, qr_tokens, chapter_member_visibility
- **`/guest` noindex** at layout level + robots.txt exclusion

## Data model

Migrations 009–015 added:

| Table | Purpose |
|---|---|
| `events` | Public-flow events (chapter, kind, ICS UID, public_visible) |
| `qr_tokens` | Signed-token registry: kind, chapter, event_id, invited_by, scan_count, revoked_at |
| `intake_sessions` | Wizard state, 24h TTL |
| `intake_guests` | The person — dedup'd on email_normalized, ghl_contact_id, magic_token_hash |
| `intake_rsvps` | One per (guest, event), idempotent unique constraint |
| `intake_conflict_log` | Frozen audit of occupants at submit-time |
| `intake_side_effect_failures` | GHL / email failure log with manual-resolve |
| `chapter_member_visibility` | Per-(member, chapter) roster opt-out + overrides |
| `intake_rate_limits` | Window counter + `intake_rate_limit_bump()` SQL fn |
| `members` (extended) | + `industry_id`, `category_id` FKs |

## Pure libraries (tested)

| Module | What | Tests |
|---|---|---|
| `src/lib/guest/conflict.ts` | Industry/category conflict resolution | 10 |
| `src/lib/guest/tokens.ts` | JWT signing/verification | 5 |
| `src/lib/guest/ics.ts` | RFC-5545 ICS generation | 2 |
| `src/lib/guest/magic.ts` | Magic-link mint + hash | 3 |
| `src/lib/guest/errors.ts` | Error-code → human copy | 8 |
| `src/lib/csv.ts` | RFC-4180 escape | 9 |
| `src/lib/datetime.ts` | datetime-local round-trip | 4 |
| `src/lib/taxonomy/suggest.ts` | Fuzzy taxonomy match | 8 |

**Total: 49 unit tests + 3 token-signing tests = 52 passing.**

## What's deferred

- **Sub-project F**: GHL field-mapping UI + automated sync retry + analytics dashboards
- **AI category classifier** for "Other" free-text guest categories
- **Wild Apricot retirement plan** once GHL is the system of record
- **Bulk actions** on Guest Inbox (mark multiple attended at once)
- **/guest/general** — self-service no-token registration; currently the no-QR path just lists events read-only

Each of these gets its own brainstorm → spec → plan cycle when prioritized.
