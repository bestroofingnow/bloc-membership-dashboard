# Networking Activity Tracker (Meetings, Connections, Referrals)

**Date:** 2026-07-30
**Status:** Approved
**Author:** James Turner (with Claude)

## Background

The mobile app already has a fully-built "Networking" suite (reachable via
More → Networking): referrals (give/receive, staged `given→contacted→met→
closed/lost`), a pairwise 1-on-1 scheduler (`meeting_invites`) and log
(`one_to_ones`), event attendance, asks/offers, and testimonials. None of it
is visible on the admin dashboard — referrals, meetings, and attendance all
have zero admin-facing surface today, even though the backend and mobile UI
are complete and have shipped since before the 1.0.1 release.

Three gaps prompted this design:

1. **Meetings are strictly two-person.** Both `meeting_invites` and
   `one_to_ones` have hard `CHECK` constraints and exactly two member-FK
   columns. There's no way to schedule or log a small-group meeting (3+
   people).
2. **There's no "connection" concept.** A connection is someone a member has
   met/networked with who isn't ready to be a formal referral yet — a warm
   lead that may turn into one or more referrals later. Nothing in the schema
   represents this today; the closest table (`asks_offers`) is an unrelated
   public marketplace board.
3. **No cross-member visibility.** Referral stats/leaderboard logic already
   exists (`src/lib/referrals/stats.ts`, the `v_referral_stats` view) but is
   never queried anywhere in the app. There's no equivalent for meetings or
   connections, and no admin tab surfaces any of it.

Additionally: some members/leadership may want the ability to turn this
entire feature area off for the organization (e.g., during a trial period, or
if it's not landing well) — a single org-wide switch, not a per-member
preference.

## Goals

- Support meetings of any size (2 or more participants) through one unified
  concept, replacing the two existing pairwise tables.
- Add a `connections` entity: people met but not yet ready to refer, which can
  later produce one or more linked referrals.
- Surface referrals, meetings, and connections activity in a new admin
  dashboard tab (aggregate counts per member — not raw content).
- Add a member-facing "Tracker" screen in the mobile app: a leaderboard of the
  same aggregate activity, visible to all members.
- Add a single org-wide toggle (admin-controlled, in the dashboard) that turns
  the entire feature (meetings/connections/referrals surfacing/tracker) on or
  off for every member at once.

## Non-Goals

- No per-member opt-out — confirmed org-wide only, not individual choice.
- No admin editing/moderation of individual meetings or connections in this
  pass — the admin tab is aggregate counts only, consistent with the existing
  privacy posture of `v_referral_stats` (no PII, no raw content).
- No change to referrals' existing stage model, RLS, or mobile UI beyond
  adding the optional `source_connection_id` link and showing it when present.
- No change to `asks_offers`, `testimonials`, or event attendance/check-in —
  attendance is being handled as a separate, independent spec (geo-verified
  check-in) that explicitly does not share this toggle.
- No mobile-side control for the org-wide toggle — it's set in the dashboard
  only; mobile just reads it.

## Design

### 1. Schema changes

New migration `046_networking_activity.sql`:

**`meetings`** — replaces `meeting_invites` and `one_to_ones`:

```sql
CREATE TABLE public.meetings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_member_id  uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('coffee','lunch','virtual')),
  status               text NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed','confirmed','completed','cancelled')),
  proposed_at          timestamptz,        -- set when scheduled ahead of time
  met_on               date,               -- set when completed/logged
  location             text,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

**`meeting_participants`** — one row per person, including the organizer:

```sql
CREATE TABLE public.meeting_participants (
  meeting_id       uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  response_status  text NOT NULL DEFAULT 'pending'
                     CHECK (response_status IN ('pending','accepted','declined')),
  PRIMARY KEY (meeting_id, member_id)
);
```

Size is derived, not stored: `count(*) FROM meeting_participants WHERE
meeting_id = X` — 2 participants is a "1-on-1," 3+ is a "group meeting." No
separate group flag. `kind` describes format (coffee/lunch/virtual), not
size, and stays a closed enum matching what `meeting_invites` already used.

Two creation paths through the same shape:
- **Propose ahead**: `status='proposed'`, `proposed_at` set, organizer's own
  participant row is `accepted`, everyone else starts `pending`.
- **Log something that already happened**: `status='completed'`, `met_on`
  set immediately, all participant rows created as `accepted` (mirrors
  today's "Logged as a 1-to-1" action, generalized to N people).

Only the organizer can move status to `cancelled`. A single participant
declining does not cancel the meeting for everyone else — it's per-participant,
not all-or-nothing.

**`connections`**:

```sql
CREATE TABLE public.connections (
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
```

**`referrals`**: one additive column —

```sql
ALTER TABLE public.referrals
  ADD COLUMN source_connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL;
```

Nullable, many-to-one: a single connection can be the source of multiple
referrals over time (the "one connection, many referrals" relationship
confirmed during design). Archiving a connection does not retroactively
affect referrals already linked to it (`ON DELETE SET NULL`, not CASCADE).

**Stats views**, same pattern/privacy posture as the existing (currently
unused) `v_referral_stats` — aggregate counts only, no raw content, no PII
beyond member name via the join the consuming query does:

```sql
CREATE VIEW public.v_meeting_stats AS
  SELECT member_id, count(*) AS meetings_count
  FROM public.meeting_participants
  WHERE response_status = 'accepted'
  GROUP BY member_id;

CREATE VIEW public.v_connection_stats AS
  SELECT c.member_id,
         count(*) AS connections_count,
         count(r.id) AS converted_count
  FROM public.connections c
  LEFT JOIN public.referrals r ON r.source_connection_id = c.id
  GROUP BY c.member_id;
```

**RLS**: `meetings`/`meeting_participants` mirror the existing
`meeting_invites` pattern — a member can read/write meetings they
participate in; nobody outside a meeting can read its content. `connections`
follow the same shape as `referrals` — owned by `member_id`, readable/
writable only by that member (+ staff). The three stats views are the only
cross-member-visible surface, and they expose counts only.

### 2. Data migration

For each existing `meeting_invites` row: one `meetings` row (`organizer_
member_id = proposed_by_member_id`, `kind`, mapped `status`, `proposed_at`)
plus 2 `meeting_participants` rows (`from_member_id`, `to_member_id`) with
`response_status` derived from the invite's old status.

For each existing `one_to_ones` row: one `meetings` row (`status=
'completed'`, `met_on` copied, `organizer_member_id = member_id`) plus 2
`meeting_participants` rows (`member_id`, `with_member_id`), both `accepted`.

**Open question to resolve during implementation**: today's "Logged as a
1-to-1" action converts a completed invite into a `one_to_ones` row, but it's
unconfirmed whether that write stores a link back to the original invite. If
it does, use it to migrate that pair as a single `meetings` row instead of
two. If it doesn't, de-duplicate heuristically by matching participant-pair +
date; worst case is a rare harmless duplicate historical row, not a
functional break. `meeting_invites` and `one_to_ones` are dropped only after
the migration is verified (row counts reconciled).

### 3. Mobile app changes

- **Networking hub** (`src/app/(tabs)/networking.tsx`): collapse the
  "Coffee & Meet-ups" and "1-to-1 Tracker" entries into one **"Meetings"**
  entry. Add **"Connections"** and **"Tracker"** entries. The entire
  "Networking" row disappears from the More menu when the org-wide toggle is
  off.
- **Meetings screen** (replaces `meetings.tsx` + `one-to-ones.tsx`): propose
  (kind, one-or-more member picker instead of today's single-member picker,
  optional date/location/note) or log a past meeting (same form, skips
  straight to `completed`). Detail view lists every participant's individual
  response status. Bucketing (needs-your-response / awaiting-others /
  upcoming / past) generalizes the existing `src/lib/meetings/invite.ts`
  logic to be participant-list-aware instead of pairwise.
- **Connections screen** (new): list of the member's own connections
  (active/archived), an add form, and a "Convert to referral" action that
  pre-fills a new referral with the contact's info and sets
  `source_connection_id`.
- **Referrals screen**: unchanged, plus displays "sourced from [connection
  name]" when `source_connection_id` is set.
- **Tracker screen** (new): ranked list of members by combined activity —
  meetings count, connections logged, referrals given/received/closed +
  value. Visible to all members when the toggle is on.
- A small `useNetworkingEnabled()` hook (mirrors the existing
  `useMyFieldVisibility` read pattern) reads the `dashboard_settings` row and
  gates the hub entry + hard-guards the screens themselves (so a stale deep
  link redirects with a "temporarily unavailable" message rather than
  crashing, matching the guard pattern already used for unconfigured/
  signed-out state elsewhere in the app).

### 4. Dashboard (admin) changes

- **New "Networking" admin tab**: a table sourced from the three stats views
  — meetings/connections/referrals counts per member, sortable. No raw
  meeting notes or connection contact details are exposed here; this is
  activity-level visibility, not content moderation.
- **Toggle control**: a new switch in the existing Admin settings area,
  writing the `networking_enabled` key into `dashboard_settings`. No new RLS
  needed — the "Admins can manage settings" policy already covers writes to
  that table; this is purely a new key/value pair.

### 5. Testing

Following the codebase's existing convention: colocated `.test.ts` files
with Vitest for new/changed lib logic —

- `src/lib/meetings/invite.ts` — extend for N-participant bucketing/
  validation (organizer-only cancel, per-participant response, group vs.
  pairwise size derivation).
- `src/lib/connections/` — new validator (contact_name required, field
  length caps, mirroring `src/lib/asks/validate.ts`'s style) and stats logic.
- `src/lib/referrals/stats.ts` — extend/verify `source_connection_id` doesn't
  break existing stage/stats logic.

No component-level UI tests exist anywhere in this codebase today; this
design doesn't introduce that testing layer either — consistent with
existing scope.

## Related follow-up (separate spec)

Geo-verified event check-in (restricting the existing `attendance.tsx`
self-check-in to only succeed when the member's device is physically at the
event location) was raised in the same conversation but is architecturally
independent — different table (`events`), no shared toggle. Tracked as its
own follow-up design, not part of this one.
