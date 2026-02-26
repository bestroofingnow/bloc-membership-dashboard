import csv
import re
from collections import Counter

CSV_PATH = 'bloc_members.csv'
OUTPUT_PATH = 'src/data/members.ts'

def extract_chapter(row):
    pref = (row.get('Preferred Chapter') or '').strip()
    if pref in ('Uptown', 'North', 'South', 'FLOC', 'Alumni'):
        return pref
    group = (row.get('Group participation') or '').strip().lower()
    if 'uptown' in group: return 'Uptown'
    if 'north' in group: return 'North'
    if 'south' in group: return 'South'
    if 'floc' in group: return 'FLOC'
    if 'alumni' in group: return 'Alumni'
    assigned = (row.get('Assigned Chapter') or '').strip()
    if assigned in ('Uptown', 'North', 'South', 'FLOC', 'Alumni'):
        return assigned
    return ''

def esc(s):
    """Escape string for use in single-quoted TypeScript string."""
    # Normalize whitespace
    s = s.replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    # Escape backslashes first, then single quotes
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "\\'")
    return s

with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

members = []
for r in rows:
    chapter = extract_chapter(r)
    if not chapter:
        continue
    name = ((r.get('First name', '') or '') + ' ' + (r.get('Last name', '') or '')).strip()
    if not name:
        continue

    street = (r.get('Business Street') or '').strip()
    city = (r.get('Business City') or '').strip()
    state = (r.get('Business State') or '').strip()
    zipcode = (r.get('Business Postal Code') or '').strip()
    addr_parts = [p for p in [street, city, state] if p]
    address = ', '.join(addr_parts)
    if zipcode:
        address += ' ' + zipcode if address else zipcode

    bday_raw = (r.get('Birthday') or '').strip()
    birthday = ''
    if bday_raw:
        try:
            parts = bday_raw.split('/')
            if len(parts) >= 2:
                birthday = f'{int(parts[0]):02d}/{int(parts[1]):02d}'
        except:
            pass

    member = {
        'id': (r.get('User ID') or '').strip(),
        'name': name,
        'company': (r.get('Business Name') or '').strip(),
        'chapter': chapter,
        'industry': (r.get('Industry') or (r.get('Specific Industry description') or '')).strip(),
        'email': (r.get('Email') or '').strip(),
        'phone': (r.get('Phone') or '').strip(),
        'title': (r.get('Title/Position') or '').strip(),
        'website': (r.get('Website') or '').strip(),
        'description': (r.get('Brief Company Description') or '').strip(),
        'address': address.strip(),
        'mobilePhone': (r.get('Mobile Phone Number') or '').strip(),
        'birthday': birthday,
        'memberSince': (r.get('Member since') or '').strip(),
        'renewalDue': (r.get('Renewal due') or '').strip(),
        'referredBy': (r.get('Referring Member 1') or '').strip(),
    }
    members.append(member)

chapter_order = {'Uptown': 0, 'North': 1, 'South': 2, 'FLOC': 3, 'Alumni': 4}
members.sort(key=lambda m: (chapter_order.get(m['chapter'], 99), m['name']))

lines = ["import { Member } from '@/types';", "", "export const members: Member[] = ["]

current_chapter = ''
for m in members:
    if m['chapter'] != current_chapter:
        current_chapter = m['chapter']
        lines.append(f"  // {current_chapter} Chapter")

    props = [
        f"id: '{m['id']}'",
        f"name: '{esc(m['name'])}'",
        f"company: '{esc(m['company'])}'",
        f"chapter: '{m['chapter']}'",
        f"industry: '{esc(m['industry'])}'",
    ]

    opt_fields = [
        ('email', 'email'), ('phone', 'phone'), ('title', 'title'),
        ('website', 'website'), ('description', 'description'),
        ('address', 'address'), ('mobilePhone', 'mobilePhone'),
        ('birthday', 'birthday'), ('memberSince', 'memberSince'),
        ('renewalDue', 'renewalDue'), ('referredBy', 'referredBy'),
    ]
    for key, tskey in opt_fields:
        val = m.get(key, '').strip()
        if val:
            props.append(f"{tskey}: '{esc(val)}'")

    lines.append('  { ' + ', '.join(props) + ' },')

lines.append('];')
lines.append('')

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

counts = Counter(m['chapter'] for m in members)
print(f'Total: {len(members)} members')
for ch in ['Uptown', 'North', 'South', 'FLOC', 'Alumni']:
    print(f'  {ch}: {counts.get(ch, 0)}')
