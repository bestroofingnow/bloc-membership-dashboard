import { describe, test, expect } from 'vitest';
import { parseBearerToken } from './auth';

describe('parseBearerToken()', () => {
  test('extracts the token from a well-formed header', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  test('is case-insensitive on the scheme and trims', () => {
    expect(parseBearerToken('bearer   xyz  ')).toBe('xyz');
  });
  test('returns empty string when missing or malformed', () => {
    expect(parseBearerToken('')).toBe('');
    expect(parseBearerToken(null)).toBe('');
    expect(parseBearerToken('Basic abc')).toBe('');
  });
});
