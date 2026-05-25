# Production Deployment Guide

This guide takes the BLOC dashboard from a local checkout to a live deployment on Vercel with Supabase, Resend, and GoHighLevel.

## Architecture

```
Browser  ──►  Vercel (Next.js 16)  ──►  Supabase (Postgres + Auth + Realtime)
                       │                          │
                       ├──►  Resend (transactional email)
                       └──►  GoHighLevel (CRM contacts)
```

Three user roles in the dashboard:

| Role | Sees |
|---|---|
| **Member** | Dashboard, Leadership, Members, Most Wanted, Pipeline (read), Scanner, Guide, My Profile |
| **Chapter Director** | Member tabs + Guest Inbox, Events, QR Codes, Roster (scoped to own chapter) |
| **Admin** | Same as Director but across all chapters, plus the Admin tab |

Public guest flow lives at `/guest/i/<token>` and `/guest/me` — no auth required.

---

## 1. Provision external services

### Supabase

1. Create a Supabase project. Note the **project ref** (the 20-char string in the dashboard URL).
2. Apply migrations in `supabase/migrations/` in numeric order (`001` → `015`):
   - The recommended path is to connect Supabase MCP and run `apply_migration` for each file, or
   - Use the Supabase CLI: `supabase db push` from a checkout linked to the project.
3. Verify these tables exist in the `public` schema:
   - Existing: `profiles`, `members`, `board_members`, `guests`, `industry_categories`, `industry_targets`, `business_card_scans`, `wa_*` (Wild Apricot tables; can be ignored)
   - From migrations 009-015: `events`, `qr_tokens`, `intake_sessions`, `intake_guests`, `intake_rsvps`, `intake_conflict_log`, `intake_side_effect_failures`, `chapter_member_visibility`, `intake_rate_limits`
4. From **Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` (public) key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret — never commit, never expose to browser**)
5. **Enable Realtime** on these tables in the Supabase dashboard so the Guest Inbox auto-updates:
   - `intake_rsvps`, `intake_side_effect_failures`, `events`, `qr_tokens`, `chapter_member_visibility`
6. Auth → Email Templates: customize "Confirm signup" and "Magic Link" to match BLOC branding.
7. Auth → URL Configuration: set Site URL to your production domain (e.g. `https://dashboard.businessleadersofcharlotte.com`).

### Resend (transactional email for guest confirmations)

1. Create a Resend account at resend.com.
2. Verify a sending domain. The recommended `from` is `no-reply@businessleadersofcharlotte.com`.
3. Create an API key → `RESEND_API_KEY`.
4. If you skip this step the app uses a mock email client — submissions still succeed, but guests don't get email confirmations and ICS attachments.

### GoHighLevel (CRM)

1. Sign in to your GHL location and go to **Settings → Business Profile → API**.
2. Create a Private Integration token with `contacts.write` scope → `GHL_API_KEY`.
3. Copy the **Location ID** from Settings → `GHL_LOCATION_ID`.
4. Skipping this step also falls back to a mock client. Guests register, but contacts don't sync. The dashboard's Guest Inbox shows sync failures explicitly.

### Wild Apricot (optional — only if you still sync events/members from WA)

Existing integration; see `docs/WILDAPRICOT_SETUP.md` for the legacy variables.

---

## 2. Generate your QR token signing secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

This is your `GUEST_TOKEN_SECRET`. Treat it like a password — anyone with this secret can mint valid QR tokens. Rotate if compromised. Existing tokens become invalid on rotation.

---

## 3. Deploy on Vercel

1. Import the repository in Vercel.
2. Framework preset: **Next.js**. Build & install commands: defaults.
3. **Set environment variables** in Vercel Project Settings → Environment Variables (Production scope):

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Public, shown to browser |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Public |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | **Secret** |
   | `GUEST_TOKEN_SECRET` | Generated 48-byte secret | **Secret**, 32+ chars required |
   | `RESEND_API_KEY` | Resend API key | Optional, mock if absent |
   | `RESEND_FROM_ADDRESS` | `no-reply@businessleadersofcharlotte.com` | Default works |
   | `GHL_API_KEY` | GoHighLevel private token | Optional, mock if absent |
   | `GHL_LOCATION_ID` | GHL Location ID | Required only if GHL_API_KEY set |
   | `ENABLE_DEV_MINT` | (leave unset) | Setting to `true` re-enables `/api/guest/dev/mint` outside prod |
   | Wild Apricot vars | per legacy docs | Optional |

4. Deploy. The first build takes ~2 minutes.

---

## 4. Bootstrap the first admin user

The signup flow creates new users with role `member` by default. The first admin must be promoted manually:

```sql
-- In Supabase SQL editor, after the user has signed up at /signup:
update profiles set role = 'admin' where email = 'admin@businessleadersofcharlotte.com';
```

After that, the Admin tab is visible and they can promote other users.

---

## 5. Seed minimum production data

For the public guest flow to be useful, you need at least one upcoming event and member roster data with `industry_id` + `category_id` set.

### Upcoming event(s)

Once the Admin / Director is logged in, use the **Events** tab to create them — no SQL required.

### Member taxonomy

Members imported from Wild Apricot or CSV likely have only the `industry` text column populated. Map these to the new `industry_id` and `category_id` FK columns one of two ways:

- **Bulk via SQL**: identify a default category per legacy industry text and update in batches.
- **Manual via UI** (after a future iteration adds inline editing): set per-member in the Members tab.

Until members have `industry_id`/`category_id`, the conflict engine considers them out-of-scope and returns `kind: 'none'` for any guest pick.

### First QR code

From the **QR Codes** tab:

1. Click "New QR code"
2. Choose **General** kind (any chapter, any event) for a public-facing print
3. Label it clearly ("BLOC general public" / "April After Hours table tent")
4. Mint → copy the URL or click "Print sheet" for a one-per-page A4 sheet

---

## 6. Smoke-test the public flow

After deployment + seed:

1. Open the QR URL in an incognito browser (mimics a guest who's never visited)
2. Walk through: landing → event picker → chapter roster → details form
3. Pick an Industry+Category that matches a seeded member; verify soft-warn shows
4. Submit → confirmation page should load with an ICS download
5. In the dashboard's Guest Inbox, the new RSVP should appear within a second (realtime)
6. Check the seeded email inbox for a Resend confirmation (if RESEND_API_KEY set)
7. Check GHL contacts for the new contact (if GHL_API_KEY set)
8. Visit the magic link in the email; should land on `/guest/me` with the RSVP listed

---

## 7. Health checks

`GET /api/health` returns 200 if the Supabase connection works, 503 otherwise. Wire this into Vercel's monitoring or a third-party uptime checker (UptimeRobot, BetterStack, etc.).

---

## 8. Operational notes

- **Rate limits**: the public flow rate-limits submissions per-IP (5/min, 20/hour). Cleared automatically; admin override is to delete rows from `intake_rate_limits`.
- **Sync failures**: when GHL or Resend errors during a submission, a row lands in `intake_side_effect_failures`. Directors see a warning icon in the Guest Inbox and can mark them resolved after fixing manually.
- **Magic link rotation**: every guest submission preserves existing valid magic links (so prior confirmation emails keep working). The link rotates only when expired or absent.
- **Token revocation**: revoking a QR code in the QR Manager prevents new scans but keeps the analytics history. Existing in-flight wizard sessions complete normally.
- **Member roster opt-out**: each member can opt themselves in/out of the public roster via the **My Profile** tab. Directors override via the **Roster** tab.

---

## 9. Backups

Supabase takes nightly backups on the Pro plan. For the free plan, export the new tables weekly:

```sql
copy (select * from events) to stdout csv header \g events.csv
copy (select * from intake_guests) to stdout csv header \g intake_guests.csv
copy (select * from intake_rsvps) to stdout csv header \g intake_rsvps.csv
copy (select * from intake_conflict_log) to stdout csv header \g intake_conflict_log.csv
copy (select * from qr_tokens) to stdout csv header \g qr_tokens.csv
copy (select * from chapter_member_visibility) to stdout csv header \g chapter_member_visibility.csv
```

---

## 10. Rolling forward — future sub-projects

These are deferred from the original spec — each gets its own design before implementation:

- **Sub-project F**: GHL field-mapping UI + automated sync retry + analytics dashboards
- **AI category classifier** for "Other" free-text guest categories (the review queue is in Guest Inbox today; AI assist is later)
- **Wild Apricot retirement plan** once GHL is the system of record

When you're ready, brainstorm any of these the same way sub-project A was brainstormed (see `docs/superpowers/specs/`).
