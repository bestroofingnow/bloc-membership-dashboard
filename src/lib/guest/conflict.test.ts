import { describe, test, expect } from 'vitest';
import { conflict } from './conflict';
import type { MemberForConflict } from './types';

const member = (overrides: Partial<MemberForConflict> = {}): MemberForConflict => ({
  id: 'm1',
  chapter: 'Uptown',
  industry_id: 'ind-real-estate',
  category_id: 'cat-residential-agent',
  full_name: 'Alice Member',
  business_name: 'Acme Realty',
  ...overrides,
});

describe('conflict()', () => {
  test('empty chapter → kind: none', () => {
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [],
    });
    expect(res.kind).toBe('none');
    expect(res.occupants).toEqual([]);
  });

  test('member with same category → kind: exact', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
    expect(res.occupants).toEqual([m]);
  });

  test('member with same industry, different category → kind: related', () => {
    const m = member({ category_id: 'cat-commercial-agent' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('related');
    expect(res.occupants).toEqual([m]);
  });

  test('member with different industry → kind: none', () => {
    const m = member({
      industry_id: 'ind-home-services',
      category_id: 'cat-plumbing',
    });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('none');
    expect(res.occupants).toEqual([]);
  });

  test('multiple occupants in same category → all returned', () => {
    const m1 = member({ id: 'm1' });
    const m2 = member({ id: 'm2', full_name: 'Bob Member' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m1, m2],
    });
    expect(res.kind).toBe('exact');
    expect(res.occupants).toHaveLength(2);
    expect(res.occupants.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  test('guest picked Other (no category_id) → kind: other', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: null,
      category_id: null,
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('other');
    expect(res.occupants).toEqual([]);
  });

  test('guest with industry but no category → kind: other (incomplete)', () => {
    const m = member();
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: null,
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('other');
  });

  test('member in different chapter is filtered by caller; conflict() trusts input', () => {
    const m = member({ chapter: 'North' });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
  });

  test('member with category but no industry → still matches on category', () => {
    const m = member({ industry_id: null });
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
  });

  // Caller contract: visibility filtering is the caller's concern for the public
  // roster preview ONLY. The conflict engine must consider all chapter members
  // regardless of roster visibility — an "invisible" member still holds a category
  // seat that conflicts with a guest's pick. Caller must pass the unfiltered list.
  test('member invisible in public roster still counts as conflict (caller contract)', () => {
    const m = member(); // visibility is not a field on MemberForConflict by design
    const res = conflict({
      chapter: 'Uptown',
      industry_id: 'ind-real-estate',
      category_id: 'cat-residential-agent',
      members_in_chapter: [m],
    });
    expect(res.kind).toBe('exact');
    expect(res.occupants).toEqual([m]);
  });
});
