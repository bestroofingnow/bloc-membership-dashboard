import { describe, test, expect } from 'vitest';
import { normalizeEmail } from './normalize-email';

describe('normalizeEmail()', () => {
  test('lowercases and trims', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });

  test('collapses blank/whitespace-only to null (never collides)', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('\t\n')).toBeNull();
  });

  test('null and undefined collapse to null', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  test('preserves internal characters, trims only edges', () => {
    expect(normalizeEmail('a b@x.com')).toBe('a b@x.com');
    expect(normalizeEmail('  a@b.co  ')).toBe('a@b.co');
  });

  test('matches the Postgres rule NULLIF(lower(btrim(email)),"")', () => {
    // btrim trims leading/trailing spaces; lower lowercases; NULLIF empties->null
    expect(normalizeEmail(' MEMBER@BLOC.COM')).toBe('member@bloc.com');
  });
});
