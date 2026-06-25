import { describe, test, expect } from 'vitest';
import { attendanceRate, currentStreak } from './stats';

describe('attendanceRate()', () => {
  test('rounds attended / eligible as a percent', () => {
    expect(attendanceRate(['e1', 'e3'], ['e1', 'e2', 'e3', 'e4'])).toBe(50);
  });
  test('ignores attended events that are not eligible', () => {
    expect(attendanceRate(['e1', 'eX'], ['e1', 'e2'])).toBe(50);
  });
  test('0 when there are no eligible events', () => {
    expect(attendanceRate(['e1'], [])).toBe(0);
  });
  test('100 when all eligible attended', () => {
    expect(attendanceRate(['e1', 'e2'], ['e1', 'e2'])).toBe(100);
  });
});

describe('currentStreak()', () => {
  test('counts consecutive most-recent attended events', () => {
    // recent-first: attended e1,e2 then missed e3
    expect(currentStreak(['e1', 'e2'], ['e1', 'e2', 'e3', 'e4'])).toBe(2);
  });
  test('0 when the most recent eligible event was missed', () => {
    expect(currentStreak(['e2', 'e3'], ['e1', 'e2', 'e3'])).toBe(0);
  });
  test('full length when every eligible event attended', () => {
    expect(currentStreak(['e1', 'e2', 'e3'], ['e1', 'e2', 'e3'])).toBe(3);
  });
});
