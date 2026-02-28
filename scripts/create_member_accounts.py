#!/usr/bin/env python3
"""
Bulk-create Supabase auth accounts for BLOC members.

For each member in bloc_members.csv with a valid email:
  1. Creates auth user via Supabase Admin API (POST /auth/v1/admin/users)
  2. Sets password to BlocMem1! with email auto-confirmed
  3. Sets must_change_password = true on the auto-created profile
  4. Updates the profile chapter to match the members table

Skips james@bestroofingnow.com (existing admin).

Usage:
    python scripts/create_member_accounts.py [--dry-run]

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

import csv
import os
import sys
import json
import time
import urllib.request
import urllib.error

DRY_RUN = '--dry-run' in sys.argv

# ---------------------------------------------------------------------------
# Load env vars from .env.local
# ---------------------------------------------------------------------------
ENV_FILE = os.path.join(os.path.dirname(__file__), '..', '.env.local')

def load_env(path):
    if not os.path.exists(path):
        print(f"ERROR: {path} not found"); sys.exit(1)
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

load_env(ENV_FILE)

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
DEFAULT_PASSWORD = 'BlocMem1!'
SKIP_EMAILS = {'james@bestroofingnow.com'}

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing SUPABASE_URL or SERVICE_ROLE_KEY"); sys.exit(1)

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'bloc_members.csv')

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def api_request(method, path, data=None):
    """Make a request to the Supabase API (auth or REST)."""
    url = f"{SUPABASE_URL}/{path}"
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return json.loads(body_text), e.code
        except json.JSONDecodeError:
            return {'error': body_text}, e.code

def rest_request(method, path, data=None, params=None):
    """Make a request to the Supabase REST API (PostgREST)."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"    REST {e.code}: {e.read().decode()}")
        return None

# ---------------------------------------------------------------------------
# 1. Read CSV → build list of members to create
# ---------------------------------------------------------------------------
print("Reading bloc_members.csv ...")
members_to_create = []

with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        first = row.get('First name', '').strip()
        last  = row.get('Last name', '').strip()
        email = row.get('Email', '').strip().lower()
        if first and last and email and email not in SKIP_EMAILS:
            members_to_create.append({
                'full_name': f"{first} {last}",
                'email': email,
            })

print(f"  Found {len(members_to_create)} members to create (excluding admin)")

# ---------------------------------------------------------------------------
# 2. Fetch members from DB to get chapter mapping (name → chapter)
# ---------------------------------------------------------------------------
print("Fetching members table for chapter mapping ...")
db_members = rest_request('GET', 'members', params={
    'select': 'name,chapter',
    'limit': '500',
})

chapter_map = {}  # lowercase name → chapter
if db_members:
    for m in db_members:
        chapter_map[m['name'].strip().lower()] = m.get('chapter')
    print(f"  Loaded {len(chapter_map)} chapter mappings")

# ---------------------------------------------------------------------------
# 3. Create auth users
# ---------------------------------------------------------------------------
if DRY_RUN:
    print("\n=== DRY RUN — no changes will be made ===\n")

created = 0
skipped = 0
errors = 0

for member in members_to_create:
    email = member['email']
    full_name = member['full_name']
    chapter = chapter_map.get(full_name.lower())

    if DRY_RUN:
        print(f"  [DRY RUN] Would create: {full_name} <{email}> chapter={chapter}")
        created += 1
        continue

    # Create auth user via Admin API
    result, status = api_request('POST', 'auth/v1/admin/users', data={
        'email': email,
        'password': DEFAULT_PASSWORD,
        'email_confirm': True,
        'user_metadata': {
            'full_name': full_name,
            'must_change_password': True,
        },
    })

    if status == 200 or status == 201:
        user_id = result.get('id')
        print(f"  CREATED: {full_name} <{email}> (id={user_id})")
        created += 1

        # Wait a moment for the trigger to create the profile
        time.sleep(0.3)

        # Update the profile: set must_change_password and chapter
        update_data = {'must_change_password': True}
        if chapter:
            update_data['chapter'] = chapter

        rest_request('PATCH', 'profiles', data=update_data, params={
            'id': f'eq.{user_id}',
        })

    elif status == 422 and 'already been registered' in str(result):
        print(f"  SKIPPED (exists): {full_name} <{email}>")
        skipped += 1
    else:
        print(f"  ERROR ({status}): {full_name} <{email}> — {result}")
        errors += 1

    # Small delay to avoid rate limiting
    if not DRY_RUN:
        time.sleep(0.1)

print(f"\nDone! Created: {created}, Skipped: {skipped}, Errors: {errors}")
