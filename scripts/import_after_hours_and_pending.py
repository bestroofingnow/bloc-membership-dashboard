#!/usr/bin/env python3
"""
One-time, idempotent import (deduped by email/name):
  - 7 After Hours Members -> members (member_type='after_hours', chapter=NULL)
  - 3 pending applicants  -> guests pipeline (status='Application Received')

Reads the 2026-05-27 member export from ~/Downloads. Requires
NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
Pass --dry-run to preview without writing.
"""
import os, sys, json, csv, urllib.request, urllib.error

DRY = '--dry-run' in sys.argv
ROOT = os.path.join(os.path.dirname(__file__), '..')
for line in open(os.path.join(ROOT, '.env.local')):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip())
URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
     'Content-Type': 'application/json', 'Prefer': 'return=representation'}

AFTER_HOURS = {'Brett Cohen', 'Amy Pierce', 'Lara Persing', 'Marc Wulf',
               'Jules Belfi', 'Aubrey Turner', 'Sharon Peterson'}
PENDING = {'Mark Weinberg', 'Ebony Jackson', 'Lara Murphy'}

DL = os.path.expanduser('~/Downloads/2026-05-27 Members Business Leaders of Charlotte.csv')

def get(path):
    r = urllib.request.Request(URL + '/rest/v1/' + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.loads(urllib.request.urlopen(r).read())

def post(table, rows):
    if not rows:
        return True, []
    if DRY:
        print(f"[dry-run] would POST {len(rows)} -> {table}: {json.dumps(rows, indent=2)}")
        return True, rows
    req = urllib.request.Request(URL + '/rest/v1/' + table, data=json.dumps(rows).encode(), headers=H, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return True, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return False, e.read().decode()

def norm(s): return (s or '').strip().lower()

rows = list(csv.DictReader(open(DL, encoding='utf-8-sig')))
db_m = get('members?select=name,email&limit=2000')
db_g = get('guests?select=name,email&limit=2000')
me = {norm(x['email']) for x in db_m if x.get('email')}; mn = {norm(x['name']) for x in db_m}
ge = {norm(x['email']) for x in db_g if x.get('email')}; gn = {norm(x['name']) for x in db_g}

members_ins, guests_ins = [], []
for r in rows:
    name = (r['First name'] + ' ' + r['Last name']).strip()
    email = (r.get('Email') or '').strip()
    industry = (r.get('Industry') or r.get('Specific Industry description') or '').strip()
    phone = (r.get('Phone') or '').strip()
    if name in AFTER_HOURS:
        if norm(email) in me or norm(name) in mn:
            continue
        members_ins.append({'name': name, 'company': (r.get('Business Name') or '').strip(),
                            'chapter': None, 'member_type': 'after_hours',
                            'industry': industry, 'email': email or None, 'phone': phone or None})
    elif name in PENDING:
        if norm(email) in ge or norm(name) in gn:
            continue
        ref = (r.get('Referring Member 1') or '').strip()
        guests_ins.append({'name': name, 'company': (r.get('Business Name') or '').strip(),
                          'industry': industry or None,
                          'invited_by': ref or 'Membership application',
                          'email': email or None, 'phone': phone or None,
                          'status': 'Application Received',
                          'next_step': 'Follow up to complete membership',
                          'notes': 'Pending-New in WA export as of 2026-05-27.',
                          'target_chapter': None})

print(f"After Hours members to add: {len(members_ins)}; pending applicants to add: {len(guests_ins)}")
ok1, res1 = post('members', members_ins)
print('members:', 'OK' if ok1 else 'FAIL', '->', (f"{len(res1)} rows" if ok1 else res1))
ok2, res2 = post('guests', guests_ins)
print('guests: ', 'OK' if ok2 else 'FAIL', '->', (f"{len(res2)} rows" if ok2 else res2))
