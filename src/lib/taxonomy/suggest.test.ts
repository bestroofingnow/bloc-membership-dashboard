import { describe, test, expect } from 'vitest';
import { normalizeForMatch, suggestTaxonomy } from './suggest';

const industries = [
  { id: 'ind-re', name: 'Real Estate' },
  { id: 'ind-home', name: 'Home Services' },
  { id: 'ind-finance', name: 'Financial' },
];

const categories = [
  { id: 'cat-res', category_id: 'ind-re', title: 'Residential Agent' },
  { id: 'cat-com', category_id: 'ind-re', title: 'Commercial Agent' },
  { id: 'cat-plumb', category_id: 'ind-home', title: 'Plumbing' },
  { id: 'cat-cpa', category_id: 'ind-finance', title: 'CPA' },
];

describe('normalizeForMatch()', () => {
  test('lowercases and collapses punctuation', () => {
    expect(normalizeForMatch('Real-Estate, LLC')).toBe('real estate llc');
  });

  test('trims edge whitespace', () => {
    expect(normalizeForMatch('  Plumbing  ')).toBe('plumbing');
  });

  test('handles null and undefined', () => {
    expect(normalizeForMatch(null)).toBe('');
    expect(normalizeForMatch(undefined)).toBe('');
  });
});

describe('suggestTaxonomy()', () => {
  test('empty input returns all nulls', () => {
    const r = suggestTaxonomy('', industries, categories);
    expect(r).toEqual({ industry_id: null, industry_name: null, category_id: null, category_title: null });
  });

  test('exact industry match', () => {
    const r = suggestTaxonomy('Real Estate', industries, categories);
    expect(r.industry_id).toBe('ind-re');
    expect(r.category_id).toBeNull();
  });

  test('exact category title match resolves industry from the category parent', () => {
    const r = suggestTaxonomy('plumbing', industries, categories);
    expect(r.industry_id).toBe('ind-home');
    expect(r.industry_name).toBe('Home Services');
    expect(r.category_id).toBe('cat-plumb');
    expect(r.category_title).toBe('Plumbing');
  });

  test('substring fuzzy match — legacy contains industry name', () => {
    const r = suggestTaxonomy('Charlotte Real Estate Group', industries, categories);
    expect(r.industry_id).toBe('ind-re');
    expect(r.category_id).toBeNull();
  });

  test('substring fuzzy match — industry name contains legacy', () => {
    // 'home' is contained in 'home services' (norm of "Home Services")
    const r = suggestTaxonomy('home', industries, categories);
    expect(r.industry_id).toBe('ind-home');
  });

  test('no match returns all nulls', () => {
    const r = suggestTaxonomy('Quantum Widgets', industries, categories);
    expect(r).toEqual({ industry_id: null, industry_name: null, category_id: null, category_title: null });
  });

  test('exact industry beats exact category beats fuzzy', () => {
    // If "Real Estate" is the input and there's no category with that exact title,
    // industry match wins despite the substring "real" also matching nothing else.
    const r = suggestTaxonomy('Real Estate', industries, categories);
    expect(r.industry_id).toBe('ind-re');
    expect(r.category_id).toBeNull();
  });
});
