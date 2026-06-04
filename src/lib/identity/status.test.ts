import { describe, test, expect } from 'vitest';
import { isValidMemberStatus, nextStatusChange } from './status';

describe('isValidMemberStatus()', () => {
  test('accepts the three canonical statuses', () => {
    expect(isValidMemberStatus('active')).toBe(true);
    expect(isValidMemberStatus('alumni')).toBe(true);
    expect(isValidMemberStatus('inactive')).toBe(true);
  });
  test('rejects anything else', () => {
    expect(isValidMemberStatus('full')).toBe(false);
    expect(isValidMemberStatus('')).toBe(false);
    expect(isValidMemberStatus('ACTIVE')).toBe(false);
  });
});

describe('nextStatusChange() — convert-in-place', () => {
  test('chapter change emits chapter_change with from/to chapter', () => {
    const c = nextStatusChange(
      { chapter: 'North', memberType: 'full', status: 'active' },
      { chapter: 'South' },
    );
    expect(c).toEqual({
      change_kind: 'chapter_change',
      from_chapter: 'North', to_chapter: 'South',
      from_type: null, to_type: null,
      from_status: null, to_status: null,
    });
  });

  test('After Hours -> full emits type_change', () => {
    const c = nextStatusChange(
      { chapter: null, memberType: 'after_hours', status: 'active' },
      { memberType: 'full', chapter: 'Uptown' },
    );
    expect(c).toEqual({
      change_kind: 'type_change',
      from_chapter: null, to_chapter: 'Uptown',
      from_type: 'after_hours', to_type: 'full',
      from_status: null, to_status: null,
    });
  });

  test('moving to alumni emits status_change', () => {
    const c = nextStatusChange(
      { chapter: 'FLOC', memberType: 'full', status: 'active' },
      { status: 'alumni' },
    );
    expect(c).toEqual({
      change_kind: 'status_change',
      from_chapter: null, to_chapter: null,
      from_type: null, to_type: null,
      from_status: 'active', to_status: 'alumni',
    });
  });

  test('a no-op change returns null (no history row)', () => {
    const c = nextStatusChange(
      { chapter: 'North', memberType: 'full', status: 'active' },
      { chapter: 'North' },
    );
    expect(c).toBeNull();
  });

  test('rejects an invalid target status by throwing', () => {
    expect(() => nextStatusChange(
      { chapter: 'North', memberType: 'full', status: 'active' },
      { status: 'gone' as unknown as 'inactive' },
    )).toThrow(/invalid member_status/);
  });
});
