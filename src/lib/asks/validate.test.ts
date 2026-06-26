import { describe, test, expect } from 'vitest';
import { validateAskOffer, filterAndSort, ASK_TITLE_MAX, ASK_BODY_MAX } from './validate';

describe('validateAskOffer()', () => {
  test('a valid ask and offer pass', () => {
    expect(validateAskOffer({ kind: 'ask', title: 'Looking for a commercial realtor' }).ok).toBe(true);
    expect(validateAskOffer({ kind: 'offer', title: 'I can intro 3 lenders', body: 'DM me' }).ok).toBe(true);
  });

  test('rejects an unknown kind', () => {
    expect(validateAskOffer({ kind: 'wishlist', title: 'x' }).ok).toBe(false);
  });

  test('requires a title', () => {
    expect(validateAskOffer({ kind: 'ask', title: '' }).ok).toBe(false);
    expect(validateAskOffer({ kind: 'ask', title: '   ' }).ok).toBe(false);
  });

  test('caps title and body length', () => {
    expect(validateAskOffer({ kind: 'ask', title: 'x'.repeat(ASK_TITLE_MAX + 1) }).ok).toBe(false);
    expect(validateAskOffer({ kind: 'ask', title: 'ok', body: 'x'.repeat(ASK_BODY_MAX + 1) }).ok).toBe(false);
  });
});

describe('filterAndSort()', () => {
  const rows = [
    { kind: 'ask' as const, status: 'open' as const, created_at: '2026-06-01T00:00:00Z' },
    { kind: 'offer' as const, status: 'open' as const, created_at: '2026-06-03T00:00:00Z' },
    { kind: 'ask' as const, status: 'closed' as const, created_at: '2026-06-02T00:00:00Z' },
  ];

  test('open-only by default, newest first', () => {
    const out = filterAndSort(rows);
    expect(out.map((r) => r.created_at)).toEqual(['2026-06-03T00:00:00Z', '2026-06-01T00:00:00Z']);
  });

  test('filters by kind', () => {
    expect(filterAndSort(rows, { kind: 'offer' }).length).toBe(1);
    expect(filterAndSort(rows, { kind: 'ask' }).length).toBe(1); // the closed ask is excluded
  });

  test('includeClosed surfaces closed posts', () => {
    expect(filterAndSort(rows, { kind: 'ask', includeClosed: true }).length).toBe(2);
  });

  test('does not mutate the input array', () => {
    const input = [...rows];
    filterAndSort(input);
    expect(input).toEqual(rows);
  });
});
