import { describe, test, expect } from 'vitest';
import {
  metMemberIds,
  membersNotYetMet,
  coveragePct,
  type OneToOneRow,
  type RosterMember,
} from './oneToOne';

const o = (a: string, b: string): OneToOneRow => ({ member_id: a, with_member_id: b });
const roster: RosterMember[] = [
  { id: 'me', chapter: 'Uptown' },
  { id: 'a', chapter: 'Uptown' },
  { id: 'b', chapter: 'Uptown' },
  { id: 'c', chapter: 'North' }, // different chapter
];

describe('metMemberIds()', () => {
  test('captures meetings logged in either direction, excludes self', () => {
    const data = [o('me', 'a'), o('b', 'me'), o('me', 'me')];
    expect(metMemberIds(data, 'me').sort()).toEqual(['a', 'b']);
  });
  test('dedupes repeated meetings with the same member', () => {
    expect(metMemberIds([o('me', 'a'), o('a', 'me'), o('me', 'a')], 'me')).toEqual(['a']);
  });
  test('empty -> none', () => {
    expect(metMemberIds([], 'me')).toEqual([]);
  });
});

describe('membersNotYetMet()', () => {
  test('only same-chapter members, excludes self and already-met', () => {
    const data = [o('me', 'a')];
    const ids = membersNotYetMet(roster, data, 'me').map((m) => m.id);
    expect(ids).toEqual(['b']); // a met, c is North, me excluded
  });
  test('when none met, returns all same-chapter peers', () => {
    expect(membersNotYetMet(roster, [], 'me').map((m) => m.id).sort()).toEqual(['a', 'b']);
  });
});

describe('coveragePct()', () => {
  test('0 when none met', () => {
    expect(coveragePct(roster, [], 'me')).toBe(0);
  });
  test('rounds the met fraction of same-chapter peers', () => {
    expect(coveragePct(roster, [o('me', 'a')], 'me')).toBe(50); // 1 of 2
  });
  test('100 when all same-chapter peers met', () => {
    expect(coveragePct(roster, [o('me', 'a'), o('me', 'b')], 'me')).toBe(100);
  });
  test('0 when no same-chapter peers exist', () => {
    expect(coveragePct([{ id: 'me', chapter: 'Alumni' }], [], 'me')).toBe(0);
  });
});
