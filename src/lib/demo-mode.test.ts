import { describe, test, expect } from 'vitest';
import { chooseInitialData, resolveFetchResult } from './demo-mode';

describe('chooseInitialData()', () => {
  test('uses the static seed only when not configured or in demo mode', () => {
    const seed = [{ id: 'seed' }];
    expect(chooseInitialData(seed, { isConfigured: false, isDemo: false })).toBe(seed);
    expect(chooseInitialData(seed, { isConfigured: true, isDemo: true })).toBe(seed);
  });

  test('starts EMPTY for a real configured, non-demo reader (no fabrication)', () => {
    const seed = [{ id: 'seed' }];
    expect(chooseInitialData(seed, { isConfigured: true, isDemo: false })).toEqual([]);
  });
});

describe('resolveFetchResult()', () => {
  const seed = [{ id: 'seed' }];
  const rows = [{ id: 'real-1' }, { id: 'real-2' }];

  test('real rows always replace whatever was there', () => {
    expect(resolveFetchResult(rows, seed, { isConfigured: true, isDemo: false })).toEqual(rows);
  });

  test('zero real rows in a live (non-demo) env yields EMPTY, never the seed', () => {
    expect(resolveFetchResult([], seed, { isConfigured: true, isDemo: false })).toEqual([]);
  });

  test('zero rows in demo mode falls back to the seed (explicit opt-in only)', () => {
    expect(resolveFetchResult([], seed, { isConfigured: true, isDemo: true })).toBe(seed);
  });
});
