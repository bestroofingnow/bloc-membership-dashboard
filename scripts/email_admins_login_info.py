#!/usr/bin/env python3
"""
Email every admin in `profiles` their dashboard login info via Resend.

For each row in profiles where role='admin':
  - Send an email containing the dashboard URL + the temporary password
  - Subject: "Your BLOC Dashboard login"

Usage:
    python scripts/email_admins_login_info.py [--dry-run] [--dashboard-url=https://...]

Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
RESEND_FROM_ADDRESS in .env.local
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

DRY_RUN = '--dry-run' in sys.argv

DASHBOARD_URL = next(
    (a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--dashboard-url=')),
    'http://localhost:3000',
)

TEMP_PASSWORD = 'BlocMem1!'

ENV_FILE = os.path.join(os.path.dirname(__file__), '..', '.env.local')
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RESEND_KEY   = os.environ.get('RESEND_API_KEY', '')
FROM_ADDR    = os.environ.get('RESEND_FROM_ADDRESS', 'no-reply@businessleadersofcharlotte.com')

if not SUPABASE_URL or not SERVICE_KEY:
    print('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)
if not RESEND_KEY and not DRY_RUN:
    print('ERROR: Missing RESEND_API_KEY (or use --dry-run to preview)')
    sys.exit(1)


def supabase_rest(method, path, data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += '?' + '&'.join(f"{k}={v}" for k, v in params.items())
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f'  Supabase {e.code}: {e.read().decode()}')
        return None


def send_email(to_email, full_name):
    html = f"""
      <p>Hi {full_name or 'there'},</p>
      <p>Your BLOC Dashboard login has been reset. Here's how to sign in:</p>
      <p>
        <strong>Dashboard:</strong> <a href="{DASHBOARD_URL}">{DASHBOARD_URL}</a><br>
        <strong>Email:</strong> {to_email}<br>
        <strong>Temporary password:</strong> <code>{TEMP_PASSWORD}</code>
      </p>
      <p>You'll be prompted to set a new password on first login.</p>
      <p>If you forgot your new password later, click <em>Forgot password?</em> on the login screen to reset it yourself.</p>
      <p>— BLOC Membership</p>
    """.strip()

    data = {
        'from': FROM_ADDR,
        'to': to_email,
        'subject': 'Your BLOC Dashboard login',
        'html': html,
    }
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps(data).encode(),
        headers={
            'Authorization': f'Bearer {RESEND_KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return True, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return False, e.read().decode()


# Fetch all admins from profiles
print(f"Fetching admins from {SUPABASE_URL}/rest/v1/profiles?role=eq.admin …")
admins = supabase_rest('GET', 'profiles', params={
    'select': 'id,email,full_name',
    'role': 'eq.admin',
    'limit': '100',
}) or []
print(f'  {len(admins)} admin(s) found')

if DRY_RUN:
    print(f'\n=== DRY RUN — would send {len(admins)} email(s) ===\n')

sent = errors = 0
for a in admins:
    email = (a.get('email') or '').strip()
    full_name = a.get('full_name') or ''
    if not email:
        print(f"  SKIP (no email): id={a.get('id')}")
        continue

    if DRY_RUN:
        print(f"  [DRY] would email: {full_name} <{email}>")
        sent += 1
        continue

    ok, result = send_email(email, full_name)
    if ok:
        sent += 1
        print(f"  SENT: {email} (id={result.get('id')})")
    else:
        errors += 1
        print(f"  ERR: {email} — {result}")
    time.sleep(0.5)  # Resend free tier is 2 req/sec

print(f"\nDone. Sent: {sent}, Errors: {errors}")
