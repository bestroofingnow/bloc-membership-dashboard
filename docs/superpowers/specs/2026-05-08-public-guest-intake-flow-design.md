# Public Guest Intake Flow — Design

**Spec date:** 2026-05-08
**Status:** Draft for review
**Owner:** James Turner
**Sub-project:** A of the BLOC Guest Event Intake + Category Conflict System

## 1. Context

The BLOC dashboard already has a `/join` public form, a `useGuests` hook, a guest pipeline kanban, and a Wild Apricot integration. This spec covers the public-facing **guest intake flow** that replaces and extends the simple `/join` form: a QR-driven, multi-step wizard that knows what chapter and event the guest is interested in, shows a chapter roster preview, captures business category, soft-warns on category conflicts, and ends with an ICS calendar download plus a confirmation email.

This spec covers the public flow only. The membership-team dashboard surface (Guest Inbox, Conflict Review Queue, Roster Manager, Event Manager, QR Manager, GHL sync UI) is decomposed into separate sub-projects with their own specs.

The CRM is migrating from Wild Apricot to **GoHighLevel**. This spec writes against GHL only. Wild Apricot retirement is a separate spec.

## 2. Goals and non-goals

### Goals

A guest can:

1. Scan a QR code and land on a context-aware page that knows chapter / event / inviting member when applicable.
2. Browse the chapter's public roster as a self-screening trust-builder.
3. Fill a short form and see a **live, soft** category-conflict warning as they pick their Industry → Category.
4. Submit and land on a confirmation page with an ICS download.
5. Receive a confirmation email with the ICS attached plus a magic link to a return-visit page.
6. Return via the magic link to RSVP for additional events without re-entering their info.

The dashboard side records a complete audit trail (`guests`, `guest_rsvps`, `conflict_log`, `side_effect_failures`) for the membership team to act on, but the dashboard UI is a separate spec.

### Non-goals

- QR Manager UI (sub-project E)
- Roster Manager UI (sub-project D)
- Guest Inbox / Detail / Conflict Review Queue UI (sub-project D)
- Category Seat Manager UI (sub-project B)
- Event Manager UI (sub-project C)
- GHL field-mapping configuration UI and retry automation (sub-project F)
- Wild Apricot sunset / data migration (separate retirement spec)
- AI classifier for "Other" free-text categories (sub-project F)
- Conversion analytics, top-inviter leaderboards (sub-project F)
- CAPTCHA, SMS confirmations, multi-language support, public per-event capacity limits, public per-chapter marketing pages

## 3. Decisions locked in during brainstorming

| Decision | Choice |
|---|---|
| Conflict behavior at intake | **Soft warn, then continue.** Guest still gets ICS, RSVP still records, conflict is logged for dashboard review. |
| QR / URL model | **Signed tokens per QR.** URL shape `/guest/i/<token>` resolves server-side to `{ kind, chapter_id?, event_id?, invited_by_member_id?, qr_id }`. |
| Roster preview role | **Trust-builder + self-screen.** Show name, business, category for visible members. Member opt-out controlled by Roster Manager. |
| Category vocabulary | **Two-level taxonomy: Industry → Category.** "Other (please describe)" free-text fallback. Existing `Targets` vocabulary is migrated as one-time seed. |
| Guest identity | **Anonymous on submit + magic-link-on-demand.** No password, no Supabase auth account. GHL contact created at submit time. Magic link enables return visits. |
| Conflict-check timing | **Live as guest picks Industry+Category** via `/api/guest/check-conflict`. Server re-checks at submit time as source of truth. |
| Architecture | **Server-driven multi-route wizard.** One route per step under `/guest/i/[token]/...`. One client island for the form's live conflict check. |

## 4. Architecture

```
src/app/guest/i/[token]/
├── page.tsx                  server, resolves token, lands the guest
├── event/page.tsx            server, event picker (skipped if token pinned event)
├── chapter/page.tsx          server, roster preview (skipped if token pinned chapter)
├── details/page.tsx          server shell + <GuestDetailsForm /> client island
└── confirm/page.tsx          server, confirmation + ICS download

src/app/guest/me/page.tsx     server, magic-link return page

src/app/api/guest/
├── check-conflict/route.ts   GET, public, rate-limited
├── submit/route.ts           POST, public, rate-limited
├── magic/route.ts            GET, exchanges magic for cookie
└── magic/refresh/route.ts    POST, requests a new magic by email

src/lib/guest/
├── tokens.ts                 sign / verify QR tokens (HMAC-SHA256)
├── conflict.ts               pure conflict-resolution function (no I/O)
├── ics.ts                    ICS file generation
├── ghl.ts                    GoHighLevel client (interface + impl)
└── email.ts                  transactional email send (interface + impl)

Supabase migration 009:
  industries, categories,
  events,
  qr_tokens, guest_sessions,
  guests, guest_rsvps,
  conflict_log, side_effect_failures,
  chapter_member_visibility
  + members.industry_id, members.category_id (FKs)
```

### Boundaries

- All public routes are server components except `<GuestDetailsForm />`, the single client island that drives the live conflict check.
- `lib/guest/conflict.ts` is **pure**. Input: `{ chapter_id, industry_id, category_id, members_in_chapter: Member[] }`. Output: `{ kind: 'none'|'exact'|'related'|'other', occupants: Member[] }`. No I/O. Callers fetch data and pass it in. This is the unit that gets exhaustive tests.
- `lib/guest/tokens.ts` only signs / verifies. It does not look up DB rows. Routes do that.
- `lib/guest/ghl.ts` and `lib/guest/email.ts` are wrapped behind interfaces so a `MockGhlClient` / `MockEmailClient` can satisfy tests without hitting real APIs.

### Why this shape

- Mirrors the existing `/join` + `/api/join` pattern.
- Each route file does one job; files stay small.
- Browser back/forward and deep-link recovery just work because state lives in the URL plus a short-lived `guest_sessions` row.
- The conflict engine is the same module that sub-projects B and D will eventually call. It's correct in one place.
- Tab-close mid-flow is recoverable: same URL → same `guest_sessions` row → resume.

## 5. Data model

New tables introduced by migration 009. Existing tables touched: `members` (gains `industry_id`, `category_id` FKs).

### `industries`

```
id          uuid pk
name        text not null
sort_order  int default 0
```

### `categories`

```
id           uuid pk
industry_id  uuid fk industries(id) not null
name         text not null
sort_order   int default 0
unique(industry_id, name)
```

### `events`

```
id              uuid pk
chapter_id      uuid fk chapters(id) null      -- null = cross-chapter (e.g. After Hours)
kind            text not null                  -- 'lunch' | 'after_hours' | 'special'
title           text not null
description     text
starts_at       timestamptz not null
ends_at         timestamptz not null
location_name   text
location_address text
ics_uid         text unique not null           -- stable UID for ICS dedup
public_visible  boolean default true
created_at      timestamptz default now()
```

### `qr_tokens`

```
id                       uuid pk
token                    text unique not null   -- short signed token in the URL
kind                     text not null          -- 'general'|'chapter'|'event'|'member_invite'|'after_hours'
chapter_id               uuid fk chapters(id) null
event_id                 uuid fk events(id) null
invited_by_member_id     uuid fk members(id) null
label                    text                   -- admin-facing label
created_by               uuid fk profiles(id)
created_at               timestamptz default now()
scan_count               int default 0
last_scanned_at          timestamptz
revoked_at               timestamptz
```

The token in the URL is HMAC-signed; verifying its signature is sufficient to extract its payload. The DB row exists for **scan tracking, labelling, and revocation**, all of which the QR Manager (sub-project E) will lean on.

### `guest_sessions`

```
id              uuid pk
token           text not null
partial_payload jsonb default '{}'
current_step    text not null              -- 'landing'|'event'|'chapter'|'details'
ip_hash         text                       -- sha256 of ip, for rate-limit/abuse
expires_at      timestamptz not null       -- default now() + 24h
created_at      timestamptz default now()
```

Reaped by a scheduled function (Supabase pg_cron) every hour: `delete from guest_sessions where expires_at < now()`.

### `guests`

```
id                 uuid pk
email              text not null               -- as entered, preserved
email_normalized   text unique not null        -- lower(trim(email))
first_name         text not null
last_name          text not null
business_name      text not null
industry_id        uuid fk industries(id) null
category_id        uuid fk categories(id) null
other_category_text text                      -- free-text when no category selected
ghl_contact_id     text                       -- stored after successful GHL upsert
magic_token_hash   text                       -- sha256 hash; null if no active magic
magic_expires_at   timestamptz
created_at         timestamptz default now()
updated_at         timestamptz default now()
```

Dedup on `email_normalized`. Re-submission with the same email upserts the guest row but always inserts a new `guest_rsvps` row.

### `guest_rsvps`

```
id                     uuid pk
guest_id               uuid fk guests(id) not null
event_id               uuid fk events(id) not null
qr_token_id            uuid fk qr_tokens(id) null
invited_by_member_id   uuid fk members(id) null
conflict_kind          text not null              -- 'none'|'exact'|'related'|'other'
conflict_member_id     uuid fk members(id) null   -- the occupant, if exact/related
status                 text not null default 'registered'  -- 'registered'|'attended'|'no_show'|'canceled'
notes                  text                        -- e.g. 'existing-member' auto-tag
submitted_at           timestamptz default now()
unique(guest_id, event_id)                         -- idempotency
```

### `conflict_log`

```
id                  uuid pk
guest_rsvp_id       uuid fk guest_rsvps(id) not null
chapter_id          uuid fk chapters(id) not null
industry_id         uuid fk industries(id) null
category_id         uuid fk categories(id) null
conflict_kind       text not null
occupants_snapshot  jsonb not null    -- frozen array of {member_id, name, business, category_id}
created_at          timestamptz default now()
```

Append-only. Captures who the occupants were **at the moment of submit** so the dashboard's review queue stays meaningful even if members change category later.

### `side_effect_failures`

```
id              uuid pk
rsvp_id         uuid fk guest_rsvps(id) not null
kind            text not null              -- 'ghl'|'email'
error_code      text
error_msg       text
retry_count     int default 0
last_attempt_at timestamptz default now()
resolved_at     timestamptz
```

The dashboard's Guest Detail page (sub-project D) provides a manual "Retry" button. No automated retry in MVP.

### `chapter_member_visibility`

```
id                    uuid pk
member_id             uuid fk members(id) not null
chapter_id            uuid fk chapters(id) not null
visible               boolean default true
public_business_name  text                            -- override; null = use member's
public_category_id    uuid fk categories(id)          -- override; null = use member's
updated_by            uuid fk profiles(id)
updated_at            timestamptz default now()
unique(member_id, chapter_id)
```

Default visible = true. The Roster Manager (sub-project D) lets members opt out and lets admins curate overrides.

### `members` extension

```
alter table members add column industry_id uuid fk industries(id);
alter table members add column category_id uuid fk categories(id);
```

A one-time data migration seeds `industries` and `categories` from the existing `Targets` taxonomy and back-fills these columns where the existing data is unambiguous. Ambiguous rows go in a manual review list for an admin to resolve before the public flow goes live.

### RLS posture

| Table | Public read | Public write | Dashboard read |
|---|---|---|---|
| `industries`, `categories` | yes | no | yes |
| `events` (where `public_visible = true`) | yes | no | yes |
| `chapter_member_visibility` (where `visible = true`) | yes | no | admin all |
| `qr_tokens` | **no** | no | admin all |
| `guests`, `guest_rsvps`, `guest_sessions`, `conflict_log`, `side_effect_failures` | no | no (writes via Server Action with service role) | chapter_director sees own-chapter; admin all |

## 6. Components

### `/guest/i/[token]/page.tsx` — landing

- Resolve token: `verifyToken()` → look up `qr_tokens` row → check not revoked → bump `scan_count`, set `last_scanned_at`.
- Render context preview (chapter, event, inviting member if applicable).
- Insert a `guest_sessions` row, set cookie `gsid = <session_id>`.
- "Continue" → routes to `event` if no event pinned, else `chapter` if no chapter pinned, else `details`.

### `/guest/i/[token]/event/page.tsx` — event picker

- Server-fetch `events` where `public_visible = true AND starts_at >= now()`, filtered to chapter if token pinned one.
- Render event cards. No client JS.

### `/guest/i/[token]/chapter/page.tsx` — roster preview

- Server-fetch `members` JOIN `chapter_member_visibility` where `visible = true`. Use override fields when present.
- Render cards: name, business (or override), category (or override), optional photo.
- Single CTA: "I'd like to attend".

### `/guest/i/[token]/details/page.tsx` — form

- Server pre-fetches industries + categories tree, passes as prop.
- **Client island `<GuestDetailsForm />`**:
  - Fields: first name, last name, email, business name, Industry select → Category select (cascading), `other_category_text` shown when no category selected.
  - On Industry+Category change, debounced 300ms fetch to `/api/guest/check-conflict?chapter=&industry=&category=`.
  - Conflict response renders inline soft-warn panel below the dropdowns: kind, occupant name + business if applicable.
  - Submit posts to `/api/guest/submit`.
- Header, progress indicator, footer remain server-rendered.

### `/guest/i/[token]/confirm/page.tsx` — confirmation

- Server-fetch `guest_rsvps` by id (passed via redirect query param + verified against session cookie).
- Render: "You're registered for {event}", `<a download>` ICS button, "We emailed your confirmation to {email}".

### `/guest/me/page.tsx` — magic-link return

- `?t=<magic>` → verify against `guests.magic_token_hash` + expiry, set cookie `guest_id`, redirect to itself without the param.
- List the guest's upcoming RSVPs with "Add to calendar" + "Cancel".
- "Register for another event" → drops them at `/guest` with `guest_id` cookie pre-filling step 5.

### `/api/guest/check-conflict` (GET, public)

- Rate-limited 30/min per IP.
- Input: `chapter_id`, `industry_id`, `category_id`.
- Calls pure `conflict()`.
- Returns `{ kind, occupant?: { name, business_name, category_name } }`. Never returns email or phone.

### `/api/guest/submit` (POST, public)

- Rate-limited 5/min, 20/hour per IP.
- Validates payload. Category contract: either `(industry_id AND category_id)` are both present, **or** `other_category_text` is present. Industry without category is a 400.
- Re-fetches members for chapter and **re-runs conflict check server-side as source of truth**. Client check is informational only.
- Transaction:
  1. Upsert `guests` on `email_normalized`.
  2. Insert `guest_rsvps` (idempotent via `unique(guest_id, event_id)`).
  3. Insert `conflict_log` with frozen `occupants_snapshot`.
  4. Set `magic_token_hash` + `magic_expires_at` on `guests`.
  5. Delete the `guest_sessions` row.
- After commit, fire-and-log: GHL upsert, email send. Failures land in `side_effect_failures`.
- Redirect to `/guest/i/<token>/confirm?rsvp=<id>`.

### `/api/guest/magic` (GET, public)

- Verify `hash(t)` against `guests.magic_token_hash` and check expiry.
- Set cookie `guest_id`, redirect.

### `/api/guest/magic/refresh` (POST, public)

- Rate-limited.
- Accepts an email; if a matching `guests` row exists, mints a new magic token and emails the link. Returns 200 in all cases (no enumeration).

## 7. Data flow

### Happy path: guest scans a member's QR for the April After Hours

```
1. QR token T encodes:
   { kind: 'member_invite', invited_by_member_id: 42,
     chapter_id: 'uptown', event_id: 'apr-after-hours-2026', qr_id: 'qr_8f3...' }

2. GET /guest/i/<T>
     verify signature → look up qr_tokens → bump scan_count
     INSERT guest_sessions
     set cookie gsid

3. → /guest/i/<T>/chapter
     event step skipped (event was pinned)
     SELECT members JOIN chapter_member_visibility WHERE visible
     render roster cards

4. → /guest/i/<T>/details
     server fetches industry+category tree
     <GuestDetailsForm /> renders

5. Live conflict check:
     debounce 300ms after Industry+Category change
     GET /api/guest/check-conflict?chapter=...&industry=...&category=...
     SELECT members WHERE chapter_id AND (category_id=... OR industry_id=...)
     conflict({ chapter_id, industry_id, category_id, members })
     → { kind: 'related', occupants: [{ Bob, Acme HVAC, Plumbing }] }
     inline soft-warn renders

6. POST /api/guest/submit
     rate-limit
     validate
     re-fetch members
     re-compute conflict_kind server-side
     BEGIN tx
       UPSERT guests ON email_normalized
       INSERT guest_rsvps (... conflict_kind, conflict_member_id, status='registered')
       INSERT conflict_log (... occupants_snapshot)
       UPDATE guests SET magic_token_hash, magic_expires_at
       DELETE guest_sessions
     COMMIT
     fire ghl.upsertContact(...) — log failure to side_effect_failures
     fire email.sendConfirmation(...) — log failure to side_effect_failures
     302 → /guest/i/<T>/confirm?rsvp=<id>

7. /guest/i/<T>/confirm?rsvp=<id>
     verify rsvp belongs to recently-cleared session
     render "You're registered" + ICS download + "We emailed your confirmation"
```

### Return-visit path

```
A. GET /guest/me?t=<magic>
     hash(magic) == magic_token_hash AND now() < magic_expires_at
     set cookie guest_id (max-age 30 days)
     302 → /guest/me

B. /guest/me
     SELECT guest_rsvps + events WHERE guest_id = cookie.guest_id
     render upcoming RSVPs + "Register for another event"
     /guest reads guest_id cookie → prefills step 5
```

### Two invariants

- **Server is the source of truth on conflicts.** The client live-check is informational. Whatever the server computes at submit-time is what gets written.
- **GHL and email are non-blocking.** RSVP commits to Supabase first; side effects run after, with failures captured in `side_effect_failures`. The guest never sees a third-party hiccup as a flow failure.

## 8. Error handling

### Token & session

| Condition | Guest sees | Server |
|---|---|---|
| Signature invalid | `/guest/error/bad-link` + CTA → `/guest` | log warning |
| Signature ok, DB row missing | same | log warning (signing-key drift?) |
| `revoked_at` not null | `/guest/error/expired-link` + CTA → `/guest` | log info |
| Token kind mismatches step | redirect to correct step | no-op |
| Session cookie missing or expired | auto-restart at landing with same token, fresh session | new `guest_sessions` row |
| Session cookie / URL token mismatch | URL token wins, session reset | log info |

### `/api/guest/check-conflict`

| Condition | Client | Server |
|---|---|---|
| DB query fails | keep prior warning state, show "couldn't verify category right now" note, allow submit | 500, logged |
| Timeout >2s | same | 504 |
| Bad params | client treats as no-conflict | 400 |
| Rate-limited | client falls back silently | 429, 30/min cap |

### `/api/guest/submit`

| Condition | Behavior |
|---|---|
| Validation fails | 400 with field-level errors; form re-renders inline. No DB writes. |
| Same `(guest, event)` already exists, status != canceled | idempotent: return 200 with existing rsvp_id; no duplicate inserts; no duplicate email. |
| Same `(guest, event)` exists with status = canceled | flip status back to 'registered'; refresh magic; resend confirmation email. Treated as a re-registration, not a duplicate. |
| Transaction fails | 500 with retry hint. Nothing committed. Form data preserved. |
| Rate-limited | 429, 5/min and 20/hour caps |
| Event in the past or not `public_visible` | 410 Gone with "no longer accepting registrations" |
| Email matches an existing `members` row | RSVP creates with `notes = 'existing-member'`. **No GHL upsert.** |

### Post-commit side effects

- Run **after** the DB transaction commits.
- Order: `ghl.upsertContact()` → `email.sendConfirmation()`.
- Failures of either are non-fatal; both insert a row into `side_effect_failures`. The dashboard's Guest Detail page (sub-project D) provides a manual "Retry" button.

### Magic link

| Condition | Behavior |
|---|---|
| Hash mismatch | `/guest/error/bad-link` |
| Expired | `/guest/error/bad-link` with "request a new link" form (POST `/api/guest/magic/refresh`) |
| Multi-use within TTL | allowed (default 30 days). Single-use is sub-project D's concern. |

### Abuse

- Per-IP rate limits on `check-conflict` (30/min) and `submit` (5/min, 20/hour).
- `email_normalized` uniqueness blocks email-flooding from creating N records.
- `qr_tokens.scan_count` makes burst-scanning visible to the dashboard.
- **No CAPTCHA in MVP.** Add only if logs show it's needed.

### Explicitly not handled

- Concurrent edits to `members` mid-conflict-check (race window <1s; `conflict_log` snapshot reflects whatever submit-time saw — fine for soft-warn).
- i18n.
- Accessibility audits beyond standard semantic HTML + ARIA on form errors.
- GHL field-mapping configuration (sub-project F).

## 9. Testing

### Layer 1 — Pure unit tests on `lib/guest/conflict.ts`

```
empty chapter → kind: none
member with same category → kind: exact, occupants = [member]
member with same industry, different category → kind: related
member with different industry → kind: none
multiple occupants in same category → kind: exact, all returned
guest picked Other (no category_id) → kind: other
guest picked Other but free-text matches a category name → kind: other (no fuzzy MVP)
member exists in chapter but is invisible in roster → still counts as conflict
member with category but no industry → still matches on category
```

### Layer 2 — `lib/guest/tokens.ts`

```
signToken → verifyToken round-trips
verifyToken with tampered payload → null
verifyToken with valid signature, wrong secret → null
verifyToken with empty payload → null
```

### Layer 3 — `lib/guest/ics.ts`

Snapshot test against a fixed event + guest. Manually verify in Apple Calendar and Google Calendar once during development; trust the snapshot afterward.

### Layer 4 — API route integration tests (Supabase test schema)

```
POST /api/guest/submit
  valid payload → 302, RSVP row exists, conflict_log row exists
  duplicate (email, event) → idempotent (same rsvp_id, no duplicate email)
  event in past → 410
  email matches existing member → RSVP created with 'existing-member' tag, no GHL upsert
  rate-limited at 6th submission in 60s

GET /api/guest/check-conflict
  happy path returns kind+occupant
  no chapter members → kind: none
  rate-limited at 31st call in 60s

GET /guest/me?t=<magic>
  valid magic → cookie set, redirect
  expired magic → error page
  tampered magic → error page
```

### Layer 5 — One end-to-end (Playwright)

```
1. Hit /guest/i/<seeded_token> with member-invite token
2. Click through to /chapter (event step skipped)
3. Click through chapter roster
4. On /details, fill name/email/business; pick Industry+Category that conflicts
5. Assert soft-warn appears with seeded occupant's name
6. Submit
7. Land on /confirm; assert ICS download attribute present
8. Assert one row in guest_rsvps with conflict_kind='exact'
9. Assert one row in conflict_log with non-empty occupants_snapshot
10. Assert one row in side_effect_failures with kind='ghl' (GHL mocked off in test) — verifies non-blocking pattern
```

### Coverage targets

- Every branch of `conflict()` has a test.
- Every error path of `/api/guest/submit` has a test.
- One e2e covering the soft-warn happy path.

### Not tested

- Visual regression on the form
- Email deliverability or rendering (provider's responsibility; manual inspection once)
- GHL real API (mocked in tests; one manual sandbox test before launch)
- Load testing (low-traffic public form; revisit if QR campaigns produce real volume)

## 10. Decisions still pending (don't change the design)

| Item | Default | Tunable via |
|---|---|---|
| Email provider | TBD: Resend / Postmark / SES | `lib/guest/email.ts` interface |
| Magic-link TTL | 30 days | env var |
| Session TTL | 24 hours | env var |
| Rate-limit numbers | 30/min, 5/min, 20/hour | env var |
| GHL pipeline / stage for new contacts | TBD | env var, read by `lib/guest/ghl.ts` |

## 11. Definition of done

A guest can:

1. Scan a QR.
2. Land on a context-aware page.
3. Browse the chapter roster.
4. Fill the form, see live soft-warn for category conflicts.
5. Submit.
6. Land on a confirmation page with an ICS download.
7. Receive a confirmation email with the ICS attached and a magic link.
8. Return via the magic link to RSVP for another event without re-entering info.

The dashboard side has the rows it needs (`guests`, `guest_rsvps`, `conflict_log`, `side_effect_failures`) for sub-projects D / E / F to build on, even though their UIs are not part of this spec.
