# Supabase Setup Guide

This guide walks through setting up the Supabase backend for the BLOC Membership Dashboard.

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier works)
2. Click **New Project**
3. Choose your organization (or create one)
4. Configure:
   - **Project name**: `bloc-dashboard`
   - **Database password**: Choose a strong password (you won't need it directly)
   - **Region**: Select the closest to Charlotte, NC (e.g., `us-east-1`)
5. Click **Create new project** and wait for it to provision (~2 minutes)

## Step 2: Get Your API Keys

1. In your Supabase project, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Step 3: Run Database Migrations

1. In Supabase, go to **SQL Editor**
2. Run each migration file in order:

### Migration 001: Core Schema
Copy and paste the contents of `supabase/migrations/001_schema.sql` and click **Run**.

This creates:
- `profiles` table (user accounts with roles)
- `members` table (BLOC members)
- `board_members` table (board/leadership)
- `guests` table (guest pipeline)
- `industry_categories` and `industry_targets` tables
- Row Level Security (RLS) policies
- Trigger to auto-create profiles on signup
- Realtime subscriptions

### Migration 002: Public Signups
Copy and paste `supabase/migrations/002_public_signup.sql` and click **Run**.

This creates:
- `public_signups` table for the `/join` form and email intake

### Migration 003: Wild Apricot Integration
Copy and paste `supabase/migrations/003_wildapricot.sql` and click **Run**.

This creates:
- `wa_contact_id` columns on members and guests
- `events` table for WA event sync
- `wa_sync_log` table for sync tracking

## Step 4: Enable Realtime

1. Go to **Database** → **Replication**
2. Under "Supabase Realtime", ensure these tables have realtime enabled:
   - `profiles`
   - `members`
   - `board_members`
   - `guests`
   - `industry_categories`
   - `industry_targets`
   - `public_signups`
   - `events`

Most of these are enabled by the migrations, but double-check here.

## Step 5: Configure Authentication

1. Go to **Authentication** → **Providers**
2. Ensure **Email** provider is enabled (it is by default)
3. Optional: Under **Email Templates**, customize the confirmation email
4. **For testing**: Go to **Authentication** → **Settings** and you can optionally:
   - Disable "Enable email confirmations" to skip email verification during testing
   - Re-enable before going live!

## Step 6: Create Your First Admin

1. Deploy the app (see [DEPLOYMENT.md](./DEPLOYMENT.md))
2. Sign up through the app at the login screen
3. Go to Supabase **SQL Editor** and run:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

4. Refresh the app — you'll now see the Admin tab
5. From the Admin tab, you can promote other users without SQL

## Demo Mode

If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set, the app runs in **demo mode** with static sample data. This is useful for previewing the UI without a database.

## Troubleshooting

### "Failed to load user profile"
- Check that migration 001 ran successfully (profiles table exists)
- Verify the auto-create profile trigger is active: go to Database → Functions, look for `handle_new_user`

### Realtime not working
- Verify Realtime is enabled for the table in Database → Replication
- Check your Supabase project's Realtime settings aren't hitting connection limits (free tier: 200 concurrent connections)

### RLS blocking queries
- The RLS policies require authenticated users. Make sure you're logged in.
- Admin operations require `role = 'admin'` in the profiles table
- Check the SQL Editor for the specific policy that might be blocking
