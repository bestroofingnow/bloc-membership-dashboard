# Deployment Guide (Vercel)

This guide covers deploying the BLOC Membership Dashboard to Vercel.

## Prerequisites

- A GitHub account with the repo pushed
- A [Vercel account](https://vercel.com) (free tier works)
- Supabase project set up (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))

## Step 1: Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select the `bloc-membership-dashboard` repository
4. Vercel will auto-detect Next.js — no configuration needed
5. Click **Deploy** (it will fail the first time without env vars — that's OK)

## Step 2: Set Environment Variables

1. In your Vercel project, go to **Settings** → **Environment Variables**
2. Add these variables:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | From Supabase Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | From Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Keep secret! Used for API routes |

### Optional: Wild Apricot
| Variable | Value | Notes |
|---|---|---|
| `WILDAPRICOT_API_KEY` | Your WA API key | See [WILDAPRICOT_SETUP.md](./WILDAPRICOT_SETUP.md) |
| `WILDAPRICOT_ACCOUNT_ID` | Your WA account ID | |

3. Click **Save**

## Step 3: Redeploy

1. Go to **Deployments** tab
2. Click the three dots on the latest deployment → **Redeploy**
3. Wait for the build to complete

## Step 4: Verify

1. Visit your Vercel URL (e.g., `bloc-dashboard.vercel.app`)
2. You should see the login screen
3. Sign up with your email
4. Promote yourself to admin (see Supabase Setup Step 6)
5. Verify all tabs load correctly

## Custom Domain (Optional)

1. In Vercel, go to **Settings** → **Domains**
2. Add your domain (e.g., `dashboard.businessleadersofcharlotte.com`)
3. Configure DNS as instructed by Vercel:
   - CNAME record: `dashboard` → `cname.vercel-dns.com`
4. Vercel auto-provisions SSL

## Updating the App

Any push to the `master` branch will trigger an automatic deployment on Vercel. You can also:

- **Preview deployments**: Push to any branch → Vercel creates a preview URL
- **Manual deploy**: Use `vercel --prod` from the CLI

## Removing GitHub Pages

Since we've moved to Vercel, you can disable GitHub Pages:

1. Go to your GitHub repo → **Settings** → **Pages**
2. Under "Source", select **None**
3. The old `.github/workflows/deploy.yml` has been removed from the codebase

## Troubleshooting

### Build fails with "Module not found"
Ensure all dependencies are in `package.json`. Run `npm install` locally to verify.

### Environment variables not working
- `NEXT_PUBLIC_*` vars are embedded at build time. After changing them, you must redeploy.
- Server-only vars (without `NEXT_PUBLIC_`) are available at runtime in API routes.

### 500 errors on API routes
Check Vercel's Function Logs: go to your project → **Deployments** → click the deployment → **Functions** tab. Look for errors in `/api/join`, `/api/wa/*` routes.
