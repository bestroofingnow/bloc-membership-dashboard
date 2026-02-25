# Email Intake Setup

This guide explains how to set up automatic email-to-lead intake for the BLOC Membership Dashboard. When someone emails a designated address, their info is automatically added as a new signup for the team to review.

## How It Works

1. An email arrives at your inbound address (e.g., `join@inbound.businessleadersofcharlotte.com`)
2. SendGrid Inbound Parse receives the email and forwards it as a webhook
3. The Supabase Edge Function parses the sender's name, email, and message
4. A new row is created in `public_signups` with `referral_source = 'Email'`
5. The signup appears in the Pipeline tab's "New Sign-ups" section in real time

## Prerequisites

- A Supabase project with the Edge Functions feature enabled (requires Supabase Pro plan or higher for custom Edge Functions, or use the free CLI for local testing)
- A SendGrid account (free tier works)
- Access to DNS for your domain

## Step 1: Deploy the Edge Function

### Using Supabase CLI

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Set the webhook secret
supabase secrets set INBOUND_EMAIL_WEBHOOK_SECRET=your-random-secret-here

# Deploy the function
supabase functions deploy inbound-email --no-verify-jwt
```

The `--no-verify-jwt` flag is needed because SendGrid's webhook won't include a Supabase JWT. We validate using a custom webhook secret instead.

### Note your Edge Function URL

After deploying, your function URL will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/inbound-email
```

## Step 2: Configure SendGrid Inbound Parse

1. Log in to [SendGrid](https://app.sendgrid.com)
2. Go to **Settings** → **Inbound Parse**
3. Click **Add Host & URL**
4. Configure:
   - **Receiving Domain**: `inbound.businessleadersofcharlotte.com` (or any subdomain you control)
   - **Destination URL**: Your Edge Function URL with the webhook secret header:
     ```
     https://YOUR_PROJECT_REF.supabase.co/functions/v1/inbound-email
     ```
   - **Check**: "POST the raw, full MIME message" (unchecked — we use the parsed version)
   - **Check**: "Check incoming emails for spam" (recommended)

5. Click **Add**

## Step 3: Configure DNS (MX Record)

Add an MX record to your domain's DNS settings:

| Type | Host/Name | Value | Priority |
|------|-----------|-------|----------|
| MX | inbound | mx.sendgrid.net | 10 |

For example, if your domain is `businessleadersofcharlotte.com`:
- **Host**: `inbound` (creates `inbound.businessleadersofcharlotte.com`)
- **Points to**: `mx.sendgrid.net`
- **Priority**: `10`

DNS changes can take up to 48 hours to propagate, but usually take effect within a few hours.

## Step 4: Add Webhook Secret to Edge Function

For security, set a webhook secret so only SendGrid can trigger your function.

Since SendGrid's Inbound Parse doesn't natively support custom headers, you have two options:

### Option A: Use SendGrid's built-in verification (Recommended)
SendGrid signs inbound parse webhooks. You can verify the signature in the Edge Function. For simplicity, the current implementation uses a custom header approach suitable for testing.

### Option B: URL-based secret
Append the secret to the URL as a query parameter and validate it in the function. Update the SendGrid destination URL to:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/inbound-email?secret=your-secret
```

## Step 5: Test the Setup

### Quick test with curl

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/inbound-email \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-random-secret-here" \
  -d '{
    "from": "Jane Doe <jane@acmecorp.com>",
    "subject": "Interested in joining BLOC",
    "text": "Hi, I heard about BLOC from a colleague and would love to learn more about membership."
  }'
```

### Verify it worked

1. Log in to the BLOC Dashboard
2. Go to the **Guest Pipeline** tab
3. Look for the "New Sign-ups" banner at the top
4. You should see "Jane Doe" from "Acmecorp" with the referral source "Email"

### Send a real email

Once DNS is propagated, send an email to `join@inbound.businessleadersofcharlotte.com` and verify it appears as a new signup.

## Troubleshooting

### Email not appearing as a signup
1. Check DNS propagation: `dig MX inbound.businessleadersofcharlotte.com`
2. Check SendGrid's Inbound Parse activity logs
3. Check Supabase Edge Function logs: `supabase functions logs inbound-email`

### Edge Function errors
- View logs: `supabase functions logs inbound-email --follow`
- Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (these are automatically available in Supabase Edge Functions)
- Ensure `INBOUND_EMAIL_WEBHOOK_SECRET` is set via `supabase secrets set`

### Duplicate entries
The function doesn't deduplicate by email address. If needed, you can add a unique constraint on the `email` column in `public_signups` or add deduplication logic to the function.
