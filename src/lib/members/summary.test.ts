import { describe, test, expect } from 'vitest';
import { isAfterHours, summarizeMembers } from './summary';
import type { Member } from '@/types';

const m = (over: Partial<Member>): Member => ({
  id: Math.random().toString(),
  name: 'X',
  company: 'C',
  chapter: 'North',
  industry: 'I',
  ...over,
});

describe('isAfterHours()', () => {
  test('true only when memberType is after_hours', () => {
    expect(isAfterHours(m({ memberType: 'after_hours', chapter: null }))).toBe(true);
    expect(isAfterHours(m({ memberType: 'full' }))).toBe(false);
    expect(isAfterHours(m({}))).toBe(false); // undefined => full
  });
});

describe('summarizeMembers()', () => {
  test('chapterCounts and fullMemberCount count only full members', () => {
    const members: Member[] = [
      m({ chapter: 'North' }),
      m({ chapter: 'North' }),
      m({ chapter: 'South' }),
      m({ memberType: 'after_hours', chapter: null }),
    ];
    const s = summarizeMembers(members);
    expect(s.chapterCounts.North).toBe(2);
    expect(s.chapterCounts.South).toBe(1);
    expect(s.chapterCounts.Uptown).toBe(0);
    expect(s.fullMemberCount).toBe(3);
    expect(s.afterHoursCount).toBe(1);
  });

  test('an after_hours member with a stray chapter is never counted in chapterCounts', () => {
    const s = summarizeMembers([m({ memberType: 'after_hours', chapter: 'North' })]);
    expect(s.chapterCounts.North).toBe(0);
    expect(s.afterHoursCount).toBe(1);
    expect(s.fullMemberCount).toBe(0);
  });
});
