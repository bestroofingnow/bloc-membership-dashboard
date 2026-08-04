import { describe, test, expect } from 'vitest';
import {
  validateMeeting,
  myParticipantStatus,
  canCancel,
  categorizeMeetings,
  type Meeting,
  type Participant,
} from './invite';

function participant(memberId: string, status: Participant['response_status'] = 'pending'): Participant {
  return { member_id: memberId, response_status: status };
}

function meeting(p: Partial<Meeting> & { participants: Participant[] }): Meeting {
  return {
    id: 'm',
    organizer_member_id: 'a',
    kind: 'coffee',
    status: 'proposed',
    proposed_at: '2026-07-01T14:00:00Z',
    met_on: null,
    location: null,
    note: null,
    ...p,
  };
}

describe('validateMeeting()', () => {
  const ok = {
    organizerId: 'a',
    participantIds: ['b', 'c'],
    kind: 'coffee',
    proposedAt: '2026-07-01T14:00:00Z',
  };
  test('a complete proposal is valid', () => {
    expect(validateMeeting(ok).ok).toBe(true);
  });
  test('requires an organizer and at least one other participant', () => {
    expect(validateMeeting({ ...ok, organizerId: '' }).ok).toBe(false);
    expect(validateMeeting({ ...ok, participantIds: [] }).ok).toBe(false);
  });
  test('the organizer cannot also be listed as a participant', () => {
    expect(validateMeeting({ ...ok, participantIds: ['a', 'b'] }).ok).toBe(false);
  });
  test('rejects duplicate participants', () => {
    expect(validateMeeting({ ...ok, participantIds: ['b', 'b'] }).ok).toBe(false);
  });
  test('rejects a bad kind', () => {
    expect(validateMeeting({ ...ok, kind: 'dinner' }).ok).toBe(false);
  });
  test('when logging a past meeting (metOn set), proposedAt is not required', () => {
    expect(validateMeeting({ ...ok, proposedAt: null, metOn: '2026-06-01' }).ok).toBe(true);
  });
  test('requires either proposedAt or metOn', () => {
    expect(validateMeeting({ ...ok, proposedAt: null, metOn: null }).ok).toBe(false);
  });
  test('caps location length', () => {
    expect(validateMeeting({ ...ok, location: 'x'.repeat(301) }).ok).toBe(false);
  });
  test('rejects an unparseable proposedAt', () => {
    expect(validateMeeting({ ...ok, proposedAt: 'whenever' }).ok).toBe(false);
  });
  test('rejects an unparseable metOn', () => {
    expect(validateMeeting({ ...ok, proposedAt: null, metOn: 'last tuesday' }).ok).toBe(false);
  });
});

describe('myParticipantStatus()', () => {
  test("returns the caller's own response status", () => {
    const m = meeting({ participants: [participant('a', 'accepted'), participant('b', 'pending')] });
    expect(myParticipantStatus(m, 'a')).toBe('accepted');
    expect(myParticipantStatus(m, 'b')).toBe('pending');
  });
  test('null when the caller is not a participant', () => {
    const m = meeting({ participants: [participant('a', 'accepted')] });
    expect(myParticipantStatus(m, 'z')).toBeNull();
  });
});

describe('canCancel()', () => {
  test('only the organizer can cancel', () => {
    const m = meeting({ organizer_member_id: 'a', participants: [participant('a', 'accepted'), participant('b', 'accepted')] });
    expect(canCancel(m, 'a')).toBe(true);
    expect(canCancel(m, 'b')).toBe(false);
  });
});

describe('categorizeMeetings()', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  const data: Meeting[] = [
    meeting({ id: 'm1', participants: [participant('a', 'accepted'), participant('me', 'pending')] }), // needs my response
    meeting({ id: 'm2', participants: [participant('me', 'accepted'), participant('b', 'pending')] }), // awaiting others
    meeting({ id: 'm3', proposed_at: '2026-07-05T14:00:00Z', participants: [participant('me', 'accepted'), participant('c', 'accepted')] }), // upcoming
    meeting({ id: 'm4', proposed_at: '2026-06-20T14:00:00Z', participants: [participant('me', 'accepted'), participant('d', 'accepted')] }), // past (elapsed)
    meeting({ id: 'm5', status: 'completed', met_on: '2026-06-10', proposed_at: null, participants: [participant('me', 'accepted'), participant('e', 'accepted')] }), // past (logged)
    meeting({ id: 'm6', status: 'cancelled', participants: [participant('me', 'pending')] }), // dropped
    meeting({ id: 'm7', participants: [participant('other1', 'pending'), participant('other2', 'accepted')] }), // I'm not in this one
    meeting({ id: 'm8', proposed_at: '2026-07-05T14:00:00Z', participants: [participant('me', 'declined'), participant('f', 'accepted')] }), // I declined — must not appear anywhere
  ];
  const c = categorizeMeetings(data, 'me', now);

  test('needs-my-response: proposed, my status still pending', () => {
    expect(c.needsMyResponse.map((m) => m.id)).toEqual(['m1']);
  });
  test('awaiting-others: proposed, I accepted, someone else still pending', () => {
    expect(c.awaitingOthers.map((m) => m.id)).toEqual(['m2']);
  });
  test('upcoming: proposed, everyone accepted, in the future', () => {
    expect(c.upcoming.map((m) => m.id)).toEqual(['m3']);
  });
  test('past: elapsed accepted meetings and completed logs, most-recent-first', () => {
    expect(c.past.map((m) => m.id)).toEqual(['m4', 'm5']);
  });
  test('drops cancelled and meetings the caller is not part of', () => {
    const ids = [...c.needsMyResponse, ...c.awaitingOthers, ...c.upcoming, ...c.past].map((m) => m.id);
    expect(ids).not.toContain('m6');
    expect(ids).not.toContain('m7');
  });
  test('drops meetings the caller has declined', () => {
    const ids = [...c.needsMyResponse, ...c.awaitingOthers, ...c.upcoming, ...c.past].map((m) => m.id);
    expect(ids).not.toContain('m8');
  });
});
