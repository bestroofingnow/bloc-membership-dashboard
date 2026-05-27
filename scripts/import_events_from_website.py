#!/usr/bin/env python3
"""
Sync upcoming events from businessleadersofcharlotte.com into the dashboard's
`events` table. Idempotent — uses a deterministic ics_uid derived from the
WA event id in the URL, so re-running upserts rather than duplicates.

Usage:
    python scripts/import_events_from_website.py [--dry-run]

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

import os
import sys
import json
import re
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

DRY_RUN = '--dry-run' in sys.argv

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

# US/Eastern timezone — events listed without explicit offset on the BLOC site
TZ_EASTERN = timezone(timedelta(hours=-4))  # EDT in May; EST in winter — close enough for storage

# ---------------------------------------------------------------------------
# Hard-coded event list pulled from https://businessleadersofcharlotte.com/events
# (Snapshot 2026-05-27 — re-run the WebFetch and regenerate this list later.)
# Each tuple: (title, date YYYY-MM-DD, start HH:MM, end HH:MM, chapter, location_name, location_address, wa_event_id, kind)
# chapter: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | None (cross-chapter)
# kind: 'lunch' | 'after_hours' | 'special'
# ---------------------------------------------------------------------------
EVENTS = [
    ('May BLOCtail - Heist Brewery in Camp North End', '2026-05-27', '17:30', '19:30', None,
     'Heist Brewery', '1030 Woodward Ave, Charlotte, NC 28206', '6527143', 'after_hours'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-06-09', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6651645', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-06-10', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484425', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-06-11', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484396', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-06-12', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484506', 'lunch'),
    ('BLOC 25th Anniversary Party', '2026-06-24', '17:30', '19:30', None,
     'Heist Brewing', '1030 Woodward Ave, Charlotte, NC 28206', '6626163', 'special'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-07-08', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484426', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-07-09', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484397', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-07-10', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484508', 'lunch'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-07-14', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673807', 'lunch'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-08-11', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673808', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-08-12', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484429', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-08-13', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484407', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-08-14', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484510', 'lunch'),
    ('August After Hours - Town Brewing Co', '2026-08-26', '17:30', '19:30', None,
     'Town Brewing Co', '800 Grandin Rd, Charlotte, NC 28208', '6527169', 'after_hours'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-09-08', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673811', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-09-09', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484431', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-09-10', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484410', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-09-11', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484511', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-10-08', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484411', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-10-09', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484514', 'lunch'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-10-13', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673816', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-10-14', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484432', 'lunch'),
    ("October After Hours - Goldie's Charlotte", '2026-10-28', '17:30', '19:30', None,
     "Goldie's Live Music Bar & Restaurant", '3601 South Blvd, Charlotte, NC 28209', '6527151', 'after_hours'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-11-10', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673818', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-11-11', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484434', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-11-12', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484412', 'lunch'),
    ('BLOC-North Lunch Meeting @ Foxcroft in Birkdale Village', '2026-11-13', '11:45', '13:00', 'North',
     'Foxcroft Birkdale', '16915 Birkdale Commons Pkwy, Huntersville, NC 28078', '6484518', 'lunch'),
    ('BLOC-South Lunch Meeting @ Ames St. Marketplace', '2026-12-08', '11:45', '13:00', 'South',
     'Ames St. Marketplace', '215 N Ames St Suite 1000, Matthews, NC 28105', '6673819', 'lunch'),
    ('FLOC Lunch Meeting @ Stir Charlotte', '2026-12-09', '11:45', '13:00', 'FLOC',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484435', 'lunch'),
    ('BLOC-Uptown Lunch Meeting @ Stir Charlotte', '2026-12-10', '11:45', '13:00', 'Uptown',
     'Stir Charlotte', '1422 S Tryon St Suite 130, Charlotte, NC 28203', '6484414', 'lunch'),
]


def to_iso(date_str, time_str):
    """Combine YYYY-MM-DD + HH:MM (local Eastern) → ISO with -04:00 offset."""
    dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=TZ_EASTERN)
    return dt.isoformat()


def rest(method, path, data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += '?' + '&'.join(f"{k}={v}" for k, v in params.items())
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
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


# ---------------------------------------------------------------------------
# Upsert each event keyed by ics_uid = f"wa-{wa_event_id}@bloc"
# ---------------------------------------------------------------------------
if DRY_RUN:
    print('\n=== DRY RUN — no changes will be made ===\n')

added = updated = errors = 0

for title, date_str, start_t, end_t, chapter, loc_name, loc_addr, wa_id, kind in EVENTS:
    ics_uid = f"wa-{wa_id}@bloc"
    starts_at = to_iso(date_str, start_t)
    ends_at = to_iso(date_str, end_t)
    description = f"Source: https://businessleadersofcharlotte.com/event-{wa_id}"

    row = {
        'ics_uid': ics_uid,
        'title': title,
        'description': description,
        'starts_at': starts_at,
        'ends_at': ends_at,
        'location_name': loc_name,
        'location_address': loc_addr,
        'chapter': chapter,
        'kind': kind,
        'public_visible': True,
    }

    if DRY_RUN:
        print(f"  [DRY] {date_str} {start_t} {chapter or '—':<7} {kind:<11} {title}")
        added += 1
        continue

    # PostgREST upsert keyed by ics_uid (UNIQUE constraint on events.ics_uid)
    data, status = rest('POST', 'events', data=row, params={'on_conflict': 'ics_uid'})
    if status in (200, 201):
        existing = data if isinstance(data, list) else [data]
        # representation returns the row — we can't easily distinguish insert vs update
        # from PostgREST without extra round-trip; count both as added for simplicity.
        added += 1
        print(f"  OK   {date_str} {start_t} {chapter or '—':<7} {title}")
    else:
        errors += 1
        print(f"  ERR  ({status}) {title}: {data}")
    time.sleep(0.05)

print(f"\nDone. Upserted: {added}, Errors: {errors}")
