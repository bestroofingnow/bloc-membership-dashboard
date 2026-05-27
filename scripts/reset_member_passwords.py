#!/usr/bin/env python3
"""
Reset all Supabase auth user passwords to a temporary password and force them
to change it on next login.

For every user in auth.users:
  1. PATCH /auth/v1/admin/users/<id> with password = DEFAULT_PASSWORD
  2. UPDATE profiles SET must_change_password=true WHERE id=<user_id>

Usage:
    python scripts/reset_member_passwords.py [--dry-run] [--skip-email=foo@bar.com]

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

DRY_RUN = '--dry-run' in sys.argv

# Allow multiple --skip-email=foo@bar.com flags
SKIP_EMAILS = {
    arg.split('=', 1)[1].strip().lower()
    for arg in sys.argv[1:]
    if arg.startswith('--skip-email=') and '=' in arg
}

DEFAULT_PASSWORD = 'BlocMem1!'

# Load env from .env.local
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

if not SUPABASE_URL or not SERVICE_KEY:
    print('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    sys.exit(1)


def api(method, path, data=None, params=None):
    url = f"{SUPABASE_URL}/{path}"
    if params:
        url += '?' + '&'.join(f"{k}={v}" for k, v in params.items())
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else {}, resp.status
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return json.loads(text), e.code
        except json.JSONDecodeError:
            return {'error': text}, e.code


# 1. List all users via the admin API (paginated)
print('Listing auth.users …')
users = []
page = 1
PER_PAGE = 200
while True:
    data, status = api('GET', 'auth/v1/admin/users', params={'page': page, 'per_page': PER_PAGE})
    if status != 200:
        print(f'  ERROR listing users (status {status}): {data}')
        sys.exit(1)
    batch = data.get('users', [])
    users.extend(batch)
    if len(batch) < PER_PAGE:
        break
    page += 1
print(f'  Loaded {len(users)} users')

if SKIP_EMAILS:
    print(f'  Skipping: {", ".join(sorted(SKIP_EMAILS))}')

# 2. Reset password + flag profile for each
if DRY_RUN:
    print('\n=== DRY RUN — no changes will be made ===\n')

reset = skipped = errors = 0

for u in users:
    uid = u.get('id')
    email = (u.get('email') or '').lower()
    if not uid or not email:
        skipped += 1
        continue
    if email in SKIP_EMAILS:
        print(f'  SKIP: {email}')
        skipped += 1
        continue

    if DRY_RUN:
        print(f'  [DRY RUN] Would reset: {email} (id={uid})')
        reset += 1
        continue

    # Update password via admin API
    _, status = api('PUT', f'auth/v1/admin/users/{uid}', data={
        'password': DEFAULT_PASSWORD,
    })
    if status not in (200, 201):
        print(f'  ERROR ({status}) updating password for {email}')
        errors += 1
        continue

    # Set must_change_password=true on the profile (silently no-op if no row)
    api('PATCH', 'rest/v1/profiles', data={'must_change_password': True}, params={'id': f'eq.{uid}'})

    print(f'  RESET: {email}')
    reset += 1
    time.sleep(0.05)  # gentle pacing

print(f'\nDone. Reset: {reset}, Skipped: {skipped}, Errors: {errors}')
