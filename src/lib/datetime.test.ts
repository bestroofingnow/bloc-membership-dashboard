import { describe, test, expect } from 'vitest';
import { toLocalDateTimeInput, fromLocalDateTimeInput } from './datetime';

describe('toLocalDateTimeInput()', () => {
  test('formats as YYYY-MM-DDTHH:MM with zero-padding', () => {
    // Construct via local time so the assertion is timezone-stable
    const d = new Date(2026, 3, 5, 7, 8); // April 5, 2026 at 07:08 local
    const out = toLocalDateTimeInput(d.toISOString());
    expect(out).toBe('2026-04-05T07:08');
  });

  test('handles midnight without single-digit drift', () => {
    const d = new Date(2026, 0, 1, 0, 0);
    expect(toLocalDateTimeInput(d.toISOString())).toBe('2026-01-01T00:00');
  });

  test('handles end-of-year wrap', () => {
    const d = new Date(2026, 11, 31, 23, 59);
    expect(toLocalDateTimeInput(d.toISOString())).toBe('2026-12-31T23:59');
  });
});

describe('fromLocalDateTimeInput()', () => {
  test('converts a local datetime-local string to ISO UTC', () => {
    const iso = fromLocalDateTimeInput('2026-04-05T07:08');
    // Parse back; the wall-clock components should round-trip in the same TZ
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(8);
  });
});

describe('round-trip', () => {
  test('toLocal → fromLocal preserves the wall-clock minute', () => {
    const original = new Date(2026, 5, 15, 14, 30); // June 15, 2026 2:30pm local
    const local = toLocalDateTimeInput(original.toISOString());
    const isoBack = fromLocalDateTimeInput(local);
    const roundTripped = new Date(isoBack);
    expect(roundTripped.getFullYear()).toBe(original.getFullYear());
    expect(roundTripped.getMonth()).toBe(original.getMonth());
    expect(roundTripped.getDate()).toBe(original.getDate());
    expect(roundTripped.getHours()).toBe(original.getHours());
    expect(roundTripped.getMinutes()).toBe(original.getMinutes());
  });
});
