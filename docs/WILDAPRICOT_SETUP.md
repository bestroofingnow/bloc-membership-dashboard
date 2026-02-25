# Wild Apricot Integration Setup

This guide explains how to connect the BLOC Membership Dashboard to your Wild Apricot (WA) account for two-way member and event sync.

## What It Does

- **Sync Members**: Pulls all active members from Wild Apricot into the dashboard's members list
- **Sync Events**: Pulls upcoming events (After Hours, lunches, etc.) into the dashboard
- **Push to WA**: When a guest is approved in the pipeline, push them as a new contact to Wild Apricot

## Prerequisites

- Admin access to your BLOC Wild Apricot account
- Your Supabase project set up with the dashboard's database schema (migration 003)

## Step 1: Create an Authorized Application in Wild Apricot

1. Log in to Wild Apricot as an admin
2. Go to **Settings** (gear icon) → **Authorized Applications**
3. Click **Authorize Application**
4. Configure:
   - **Application name**: `BLOC Dashboard`
   - **Application type**: **Server application** (this is important — not "Web application")
   - **API access**: Select appropriate permissions:
     - **Contacts**: Read + Write (needed for member sync and pushing new contacts)
     - **Events**: Read (needed for event sync)
     - **Account**: Read (for basic account info)
5. Click **Save**
6. **Copy the API key** — you'll only see it once! Save it securely.

## Step 2: Find Your Account ID

Your Wild Apricot Account ID is visible in:
- The URL when logged in: `https://app.wildapricot.org/admin/YOUR_ACCOUNT_ID/...`
- Or go to **Settings** → **Organization** → look for the Account ID

## Step 3: Configure Environment Variables

Add these to your `.env.local` file (or Vercel environment variables):

```env
WILDAPRICOT_API_KEY=your-api-key-from-step-1
WILDAPRICOT_ACCOUNT_ID=your-account-id-from-step-2
```

## Step 4: Run Database Migration

If you haven't already, run migration `003_wildapricot.sql` in your Supabase SQL Editor. This adds:
- `wa_contact_id` column to `members` table
- `wa_contact_id` column to `guests` table
- `events` table for synced events
- `wa_sync_log` table for tracking sync history

## Step 5: Test the Sync

1. Log in to the BLOC Dashboard as an admin
2. Go to the **Admin** tab
3. Scroll to the **Wild Apricot Sync** section
4. Click **Sync Now** for Members
5. Verify members appear in the **Members** tab
6. Click **Sync Now** for Events
7. Verify events appear in the dashboard

## Field Mapping

### Members (WA Contact → Dashboard Member)

| Wild Apricot Field | Dashboard Field | Notes |
|---|---|---|
| First Name + Last Name | `name` | Combined into full name |
| Organization | `company` | |
| Email | `email` | |
| Phone | `phone` | Falls back to FieldValues phone |
| Membership Level / Group | `chapter` | Auto-detected from level name |
| Industry (custom field) | `industry` | Falls back to "Other" |
| Contact ID | `wa_contact_id` | Used for deduplication |

### Events (WA Event → Dashboard Event)

| Wild Apricot Field | Dashboard Field | Notes |
|---|---|---|
| Name | `name` | |
| Description | `description` | |
| Start Date | `event_date` | |
| End Date | `end_date` | |
| Location | `location` | |
| Event Type / Name | `event_type` | Auto-detected: after_hours, lunch, social, other |
| Event ID | `wa_event_id` | Used for deduplication |
| Registration URL | `registration_url` | |
| Registrations Limit | `max_registrants` | |
| Confirmed Registrations | `current_registrants` | |

## Customizing Field Mapping

If your Wild Apricot account uses custom field names, you may need to update the mapping in:

- `src/app/api/wa/sync-members/route.ts` — the `getFieldValue()` and `mapChapter()` functions
- `src/app/api/wa/sync-events/route.ts` — the `mapEventType()` function

Common customizations:
- Chapter detection logic (if your membership levels are named differently)
- Industry field name (if you use a different custom field)
- Phone field name

## Troubleshooting

### "Wild Apricot is not configured"
Ensure both `WILDAPRICOT_API_KEY` and `WILDAPRICOT_ACCOUNT_ID` are set in your environment variables. If deploying to Vercel, add them in the Vercel dashboard under Settings → Environment Variables.

### "WA auth failed (401)"
Your API key may be invalid or expired. Go to Wild Apricot → Settings → Authorized Applications and regenerate the key.

### "WA API error (403)"
The authorized application doesn't have sufficient permissions. Check that Contacts (read/write) and Events (read) are enabled.

### Members not appearing in correct chapters
Update the `mapChapter()` function in `src/app/api/wa/sync-members/route.ts` to match your Wild Apricot membership level names.

### Sync is slow
Wild Apricot API has rate limits. For large member lists (500+), the sync may take a minute. The sync runs server-side so you can navigate away and check back.
