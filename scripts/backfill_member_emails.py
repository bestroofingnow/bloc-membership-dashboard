#!/usr/bin/env python3
"""
Backfill member emails in the members table from bloc_members.csv.
Matches by "First Last" name against the members.name column.

Usage:
    python scripts/backfill_member_emails.py

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

import csv
import os
import sys
import json
import urllib.request
import urllib.error

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

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing SUPABASE_URL or SERVICE_ROLE_KEY"); sys.exit(1)

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'bloc_members.csv')

# ---------------------------------------------------------------------------
# Helper: Supabase REST call
# ---------------------------------------------------------------------------
def supabase_request(method, path, data=None, params=None):
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
        print(f"  HTTP {e.code}: {e.read().decode()}")
        return None

# ---------------------------------------------------------------------------
# 1. Read CSV → build name→email map
# ---------------------------------------------------------------------------
print("Reading bloc_members.csv ...")
csv_lookup = {}  # "First Last" → email (lowercase key for matching)

with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        first = row.get('First name', '').strip()
        last  = row.get('Last name', '').strip()
        email = row.get('Email', '').strip()
        if first and last and email:
            full_name = f"{first} {last}"
            csv_lookup[full_name.lower()] = email

print(f"  Found {len(csv_lookup)} members with name+email in CSV")

# ---------------------------------------------------------------------------
# 2. Fetch all members from DB
# ---------------------------------------------------------------------------
print("Fetching members from database ...")
members = supabase_request('GET', 'members', params={
    'select': 'id,name,email',
    'limit': '500',
})

if members is None:
    print("ERROR: Failed to fetch members"); sys.exit(1)

print(f"  Found {len(members)} members in database")

# ---------------------------------------------------------------------------
# 3. Match and update
# ---------------------------------------------------------------------------
updated = 0
skipped = 0
not_found = 0

for member in members:
    name = member['name'].strip()
    existing_email = member.get('email')

    if existing_email:
        skipped += 1
        continue

    csv_email = csv_lookup.get(name.lower())
    if not csv_email:
        print(f"  NO MATCH: {name}")
        not_found += 1
        continue

    # Patch the member row
    result = supabase_request('PATCH', 'members', data={'email': csv_email}, params={
        'id': f'eq.{member["id"]}',
    })

    if result is not None:
        print(f"  UPDATED: {name} -> {csv_email}")
        updated += 1
    else:
        print(f"  FAILED:  {name}")

print(f"\nDone! Updated: {updated}, Skipped (already had email): {skipped}, No CSV match: {not_found}")
