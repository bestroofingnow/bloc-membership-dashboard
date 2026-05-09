import { describe, test, expect } from 'vitest';
import { mintMagic, hashMagic } from './magic';

describe('magic-link helpers', () => {
  test('mintMagic returns { token, hash, expires_at }', () => {
    const m = mintMagic({ ttlDays: 30 });
    expect(typeof m.token).toBe('string');
    expect(m.token.length).toBeGreaterThanOrEqual(32);
    expect(typeof m.hash).toBe('string');
    expect(m.hash.length).toBe(64); // sha256 hex
    expect(m.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('hashMagic is deterministic', () => {
    expect(hashMagic('abc')).toBe(hashMagic('abc'));
    expect(hashMagic('abc')).not.toBe(hashMagic('xyz'));
  });

  test('mint then verify by hash matches', () => {
    const m = mintMagic({ ttlDays: 30 });
    expect(hashMagic(m.token)).toBe(m.hash);
  });
});
