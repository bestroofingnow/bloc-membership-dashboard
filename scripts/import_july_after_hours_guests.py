#!/usr/bin/env python3
"""
One-time, idempotent import of the 2026-07-29 "July After Hours - Hoppin'"
event registration's non-member guests into the `guests` pipeline table.

Source: 2026-07-29 July After Hours - Hoppin_ Business Leaders of Charlotte.xls
(Wild Apricot registration export), filtered to "Non-Members" ticket type.
Skips anyone already present in `guests` or `members` (matched by email).

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
Pass --dry-run to preview without writing.
"""
import os, sys, json, urllib.request, urllib.error

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

NOTE = "Registered for July After Hours (2026-07-29) via public event registration."

GUESTS = [
    {'name': 'Regina Williams', 'company': 'JG Williams Law Group, PLLC',
     'email': 'regina@jglaw-group.com', 'phone': '7047509413'},
    {'name': 'Chester Bissell', 'company': 'Big V',
     'email': 'chesterbissell@gmail.com', 'phone': '9198009158'},
    {'name': 'Erin Frase', 'company': 'Braintrust',
     'email': 'erinf@ourbraintrust.org', 'phone': ''},
    {'name': 'Adham Fayed', 'company': 'Tecta America',
     'email': 'afayed@tectaamerica.com', 'phone': '7042904835'},
    {'name': 'Brittany Guild', 'company': 'USA Today Co/ LocaliQ',
     'email': 'bguild@localiq.com', 'phone': '6077423304'},
    {'name': 'Stephanie Fogle', 'company': 'Independent Consultant',
     'email': 'stephanie.fogle@gmail.com', 'phone': '9179026443'},
    {'name': 'Jennifer Errington', 'company': 'Errington Law, PLLC',
     'email': 'jaerrington@gmail.com', 'phone': '7046148636'},
    {'name': 'Alec Yassin', 'company': 'Goosehead',
     'email': 'alec.yassin@goosehead.com', 'phone': '3019565811',
     'invited_by': 'Jacob Shope'},
    {'name': 'Andrew Davis', 'company': 'BBSI',
     'email': 'a.davis@bbsi.com', 'phone': '7046162322'},
    {'name': 'Sunny Jackson', 'company': '',
     'email': 'sunny@pylorai.com', 'phone': '2164664201'},
    {'name': 'Bree Jones', 'company': 'BREE Creative Productions',
     'email': 'breecreativeproductions@gmail.com', 'phone': ''},
    {'name': 'Bradford Clarkson', 'company': 'First Citizens Bank',
     'email': 'bradford.clarkson@firstcitizens.com', 'phone': ''},
    {'name': 'Jillian Hamady', 'company': 'Empress Consulting',
     'email': 'jillian.hamady@empressconsulting.biz', 'phone': '9802505021'},
]

def get(path):
    r = urllib.request.Request(URL + '/rest/v1/' + path,
                                headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.loads(urllib.request.urlopen(r).read())

def post(table, rows):
    if not rows:
        return True, []
    if DRY:
        print(f"[dry-run] would POST {len(rows)} -> {table}:")
        print(json.dumps(rows, indent=2))
        return True, rows
    req = urllib.request.Request(URL + '/rest/v1/' + table, data=json.dumps(rows).encode(),
                                  headers=H, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return True, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return False, e.read().decode()

def norm(s): return (s or '').strip().lower()

db_g = get('guests?select=name,email&limit=2000')
db_m = get('members?select=name,email&limit=2000')
ge = {norm(x['email']) for x in db_g if x.get('email')}
me = {norm(x['email']) for x in db_m if x.get('email')}

guests_ins = []
skipped = []
for g in GUESTS:
    if norm(g['email']) in ge or norm(g['email']) in me:
        skipped.append(g['name'])
        continue
    guests_ins.append({
        'name': g['name'],
        'company': g['company'],
        'industry': None,
        'invited_by': g.get('invited_by') or 'July After Hours registration',
        'email': g['email'] or None,
        'phone': g['phone'] or None,
        'status': 'After Hours Invited',
        'next_step': 'Confirm RSVP',
        'notes': NOTE,
        'target_chapter': None,
    })

print(f"Skipping (already in guests/members): {skipped}")
print(f"Guests to add: {len(guests_ins)}")
ok, res = post('guests', guests_ins)
print('guests:', 'OK' if ok else 'FAIL', '->', (f"{len(res)} rows inserted" if ok else res))
