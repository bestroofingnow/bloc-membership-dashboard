import { describe, test, expect } from 'vitest';
import { directoryRowToMember, type DirectoryRow } from './directory';

const baseRow: DirectoryRow = {
  id: 'm1',
  name: 'Jane Doe',
  company: 'Doe Co',
  chapter: 'North',
  member_type: 'full',
  industry: 'Roofing',
  title: 'Owner',
  website: 'doe.co',
  description: 'desc',
  email: 'jane@doe.co',
  phone: '704-555-0001',
  industry_id: null,
  category_id: null,
  member_since: '2020',
  renewal_due: '2026',
  referred_by: 'Bob',
  mobile_phone: null,
  address: null,
  birthday: null,
};

describe('directoryRowToMember()', () => {
  test('maps business fields and leaves nulled personal fields undefined', () => {
    const m = directoryRowToMember(baseRow);
    expect(m).toMatchObject({
      id: 'm1',
      name: 'Jane Doe',
      company: 'Doe Co',
      chapter: 'North',
      memberType: 'full',
      industry: 'Roofing',
      title: 'Owner',
      website: 'doe.co',
      email: 'jane@doe.co',
      phone: '704-555-0001',
      memberSince: '2020',
      renewalDue: '2026',
      referredBy: 'Bob',
    });
    expect(m.mobilePhone).toBeUndefined();
    expect(m.address).toBeUndefined();
    expect(m.birthday).toBeUndefined();
  });

  test('after_hours maps to after_hours; null chapter preserved', () => {
    const m = directoryRowToMember({ ...baseRow, member_type: 'after_hours', chapter: null });
    expect(m.memberType).toBe('after_hours');
    expect(m.chapter).toBeNull();
  });

  test('any unknown member_type falls back to full', () => {
    const m = directoryRowToMember({ ...baseRow, member_type: 'weird' as DirectoryRow['member_type'] });
    expect(m.memberType).toBe('full');
  });

  test('present personal fields are surfaced (owner/staff/opted-in case)', () => {
    const m = directoryRowToMember({
      ...baseRow,
      mobile_phone: '704-555-9999',
      address: '1 Main St',
      birthday: '03/14',
    });
    expect(m.mobilePhone).toBe('704-555-9999');
    expect(m.address).toBe('1 Main St');
    expect(m.birthday).toBe('03/14');
  });
});
