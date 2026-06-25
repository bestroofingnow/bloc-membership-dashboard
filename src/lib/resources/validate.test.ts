import { describe, test, expect } from 'vitest';
import { validateResourceInput, RESOURCE_CATEGORIES } from './validate';
import { groupByCategory } from './group';

describe('validateResourceInput()', () => {
  test('requires a non-empty title', () => {
    expect(validateResourceInput({ title: '   ' }).ok).toBe(false);
  });
  test('rejects an overlong title', () => {
    expect(validateResourceInput({ title: 'x'.repeat(201) }).ok).toBe(false);
  });
  test('accepts a valid http(s) url', () => {
    expect(validateResourceInput({ title: 'Guide', url: 'https://example.com/x' }).ok).toBe(true);
  });
  test('rejects a non-http url', () => {
    expect(validateResourceInput({ title: 'Guide', url: 'javascript:alert(1)' }).ok).toBe(false);
  });
  test('allows a null/empty url', () => {
    expect(validateResourceInput({ title: 'Note', url: '' }).ok).toBe(true);
  });
  test('rejects an unknown category', () => {
    expect(validateResourceInput({ title: 'Guide', category: 'Bogus' }).ok).toBe(false);
  });
  test('accepts a known category', () => {
    expect(validateResourceInput({ title: 'Guide', category: RESOURCE_CATEGORIES[0] }).ok).toBe(true);
  });
});

describe('groupByCategory()', () => {
  test('groups by category (null -> Other), sorts categories then titles', () => {
    const out = groupByCategory([
      { category: 'Form', title: 'W-9' },
      { category: null, title: 'Misc' },
      { category: 'Form', title: 'Application' },
    ]);
    expect(out.map((g) => g.category)).toEqual(['Form', 'Other']);
    expect(out[0].items.map((i) => i.title)).toEqual(['Application', 'W-9']);
  });
  test('empty -> empty', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
