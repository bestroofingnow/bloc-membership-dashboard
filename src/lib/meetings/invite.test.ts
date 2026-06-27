import { describe, test, expect } from 'vitest';
import {
  validateInvite,
  awaitingMemberId,
  canRespond,
  counterpartId,
  categorizeInvites,
  type MeetingInvite,
} from './invite';

describe('validateInvite()', () => {
  const ok = { fromId: 'a', toId: 'b', kind: 'coffee', proposedAt: '2026-07-01T14:00:00Z' };
  test('a complete invite is valid', () => {
    expect(validateInvite(ok).ok).toBe(true);
  });
  test('requires from, to, and they must differ', () => {
    expect(validateInvite({ ...ok, fromId: null }).ok).toBe(false);
    expect(validateInvite({ ...ok, toId: null }).ok).toBe(false);
    expect(validateInvite({ ...ok, toId: 'a' }).ok).toBe(false);
  });
  test('rejects a bad kind or unparseable date', () => {
    expect(validateInvite({ ...ok, kind: 'dinner' }).ok).toBe(false);
    expect(validateInvite({ ...ok, proposedAt: 'whenever' }).ok).toBe(false);
    expect(validateInvite({ ...ok, proposedAt: null }).ok).toBe(false);
  });
  test('caps location length', () => {
    expect(validateInvite({ ...ok, location: 'x'.repeat(301) }).ok).toBe(false);
  });
});

function inv(p: Partial<MeetingInvite>): MeetingInvite {
  return {
    id: 'i',
    from_member_id: 'a',
    to_member_id: 'b',
    proposed_by_member_id: 'a',
    kind: 'coffee',
    proposed_at: '2026-07-01T14:00:00Z',
    location: null,
    note: null,
    status: 'pending',
    ...p,
  };
}

describe('awaitingMemberId() / canRespond()', () => {
  test('pending invite awaits the party who did NOT propose', () => {
    expect(awaitingMemberId(inv({ proposed_by_member_id: 'a' }))).toBe('b');
    expect(awaitingMemberId(inv({ proposed_by_member_id: 'b' }))).toBe('a');
  });
  test('a reschedule by the invitee flips whose turn it is', () => {
    // b proposed a new time → now a must respond
    expect(awaitingMemberId(inv({ proposed_by_member_id: 'b' }))).toBe('a');
  });
  test('non-pending invites await no one', () => {
    expect(awaitingMemberId(inv({ status: 'accepted' }))).toBeNull();
    expect(awaitingMemberId(inv({ status: 'declined' }))).toBeNull();
  });
  test('only the awaiting party can respond', () => {
    const i = inv({ proposed_by_member_id: 'a' });
    expect(canRespond(i, 'b')).toBe(true);
    expect(canRespond(i, 'a')).toBe(false);
  });
});

describe('counterpartId()', () => {
  test('returns the other participant', () => {
    const i = inv({ from_member_id: 'a', to_member_id: 'b' });
    expect(counterpartId(i, 'a')).toBe('b');
    expect(counterpartId(i, 'b')).toBe('a');
  });
});

describe('categorizeInvites()', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  const data: MeetingInvite[] = [
    inv({ id: 'm1', status: 'pending', proposed_by_member_id: 'b' }), // awaits me (a)
    inv({ id: 'm2', status: 'pending', proposed_by_member_id: 'a' }), // awaits them (b)
    inv({ id: 'm3', status: 'accepted', proposed_at: '2026-07-05T14:00:00Z' }), // upcoming
    inv({ id: 'm4', status: 'accepted', proposed_at: '2026-06-20T14:00:00Z' }), // past
    inv({ id: 'm5', status: 'completed', proposed_at: '2026-06-10T14:00:00Z' }), // past
    inv({ id: 'm6', status: 'declined' }), // dropped
    inv({ id: 'm7', status: 'cancelled' }), // dropped
  ];
  const c = categorizeInvites(data, 'a', now);

  test('buckets pending by whose turn it is', () => {
    expect(c.needsMyResponse.map((i) => i.id)).toEqual(['m1']);
    expect(c.awaitingThem.map((i) => i.id)).toEqual(['m2']);
  });
  test('splits accepted into upcoming vs past and includes completed in past', () => {
    expect(c.upcoming.map((i) => i.id)).toEqual(['m3']);
    expect(c.past.map((i) => i.id)).toEqual(['m4', 'm5']); // most-recent-first
  });
  test('drops declined and cancelled', () => {
    const ids = [...c.needsMyResponse, ...c.awaitingThem, ...c.upcoming, ...c.past].map((i) => i.id);
    expect(ids).not.toContain('m6');
    expect(ids).not.toContain('m7');
  });
});
