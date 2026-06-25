import { describe, test, expect } from 'vitest';
import { isCheckInOpen } from './checkin';

const ev = { starts_at: '2026-07-08T16:45:00Z', ends_at: '2026-07-08T18:00:00Z' };

describe('isCheckInOpen()', () => {
  test('closed more than 60 min before start', () => {
    expect(isCheckInOpen(ev, new Date('2026-07-08T15:30:00Z'))).toBe(false); // 75 min before
  });
  test('open within 60 min before start', () => {
    expect(isCheckInOpen(ev, new Date('2026-07-08T16:00:00Z'))).toBe(true); // 45 min before
  });
  test('open during the event', () => {
    expect(isCheckInOpen(ev, new Date('2026-07-08T17:30:00Z'))).toBe(true);
  });
  test('closed after the event ends', () => {
    expect(isCheckInOpen(ev, new Date('2026-07-08T18:30:00Z'))).toBe(false);
  });
  test('false on invalid dates', () => {
    expect(isCheckInOpen({ starts_at: 'nope', ends_at: 'nope' }, new Date())).toBe(false);
  });
});
