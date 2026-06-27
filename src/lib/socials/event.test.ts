import { describe, test, expect } from 'vitest';
import {
  validateSocialEvent,
  countRsvps,
  myRsvp,
  splitEvents,
  type SocialEvent,
  type Rsvp,
} from './event';

describe('validateSocialEvent()', () => {
  const ok = { hostId: 'h', kind: 'happy_hour', title: 'BLOCtail at Heist', startsAt: '2026-07-10T22:00:00Z' };
  test('a complete event is valid', () => {
    expect(validateSocialEvent(ok).ok).toBe(true);
  });
  test('requires host, valid kind, title, and a parseable date', () => {
    expect(validateSocialEvent({ ...ok, hostId: null }).ok).toBe(false);
    expect(validateSocialEvent({ ...ok, kind: 'rave' }).ok).toBe(false);
    expect(validateSocialEvent({ ...ok, title: '' }).ok).toBe(false);
    expect(validateSocialEvent({ ...ok, startsAt: 'soon' }).ok).toBe(false);
  });
  test('caps title and location length', () => {
    expect(validateSocialEvent({ ...ok, title: 'x'.repeat(121) }).ok).toBe(false);
    expect(validateSocialEvent({ ...ok, location: 'x'.repeat(301) }).ok).toBe(false);
  });
});

const rsvps: Rsvp[] = [
  { id: '1', event_id: 'e1', member_id: 'a', response: 'going' },
  { id: '2', event_id: 'e1', member_id: 'b', response: 'going' },
  { id: '3', event_id: 'e1', member_id: 'c', response: 'maybe' },
  { id: '4', event_id: 'e1', member_id: 'd', response: 'declined' },
  { id: '5', event_id: 'e2', member_id: 'a', response: 'going' },
];

describe('countRsvps()', () => {
  test('counts going and maybe for one event only', () => {
    expect(countRsvps(rsvps, 'e1')).toEqual({ going: 2, maybe: 1 });
    expect(countRsvps(rsvps, 'e2')).toEqual({ going: 1, maybe: 0 });
    expect(countRsvps(rsvps, 'none')).toEqual({ going: 0, maybe: 0 });
  });
});

describe('myRsvp()', () => {
  test('returns my response or null', () => {
    expect(myRsvp(rsvps, 'e1', 'a')).toBe('going');
    expect(myRsvp(rsvps, 'e1', 'c')).toBe('maybe');
    expect(myRsvp(rsvps, 'e1', 'zzz')).toBeNull();
  });
});

describe('splitEvents()', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  function ev(p: Partial<SocialEvent>): SocialEvent {
    return {
      id: 'e',
      host_member_id: 'h',
      kind: 'happy_hour',
      title: 't',
      description: null,
      starts_at: '2026-07-05T00:00:00Z',
      location: null,
      chapter: null,
      status: 'open',
      created_at: '',
      ...p,
    };
  }
  const events = [
    ev({ id: 'future1', starts_at: '2026-07-10T00:00:00Z' }),
    ev({ id: 'future2', starts_at: '2026-07-03T00:00:00Z' }),
    ev({ id: 'pastA', starts_at: '2026-06-20T00:00:00Z' }),
    ev({ id: 'cancelled', starts_at: '2026-07-09T00:00:00Z', status: 'cancelled' }),
  ];
  const s = splitEvents(events, now);
  test('upcoming is soonest-first and excludes cancelled', () => {
    expect(s.upcoming.map((e) => e.id)).toEqual(['future2', 'future1']);
  });
  test('past is most-recent-first', () => {
    expect(s.past.map((e) => e.id)).toEqual(['pastA']);
  });
});
