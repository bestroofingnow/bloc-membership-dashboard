import { describe, test, expect } from 'vitest';
import { memberMatchesQuery } from './search';
import type { Member } from '@/types';

const jordan: Member = {
  id: '1', name: 'Jordan Banks', company: 'Example National Bank', chapter: 'North',
  industry: 'Banking', title: 'Branch Manager', memberType: 'full',
};
const riley: Member = {
  id: '2', name: 'Riley Carpenter', company: 'Sample Roofing Co.', chapter: 'North',
  industry: 'Roofing', title: 'Owner', memberType: 'full',
};

describe('memberMatchesQuery()', () => {
  test('empty / whitespace query matches everyone', () => {
    expect(memberMatchesQuery(jordan, '')).toBe(true);
    expect(memberMatchesQuery(jordan, '   ')).toBe(true);
  });

  test('a single term matches across name, company, industry, title, and chapter (case-insensitive)', () => {
    expect(memberMatchesQuery(jordan, 'jordan')).toBe(true);     // name
    expect(memberMatchesQuery(jordan, 'national')).toBe(true);   // company
    expect(memberMatchesQuery(jordan, 'BANKING')).toBe(true);    // industry, case-insensitive
    expect(memberMatchesQuery(jordan, 'branch')).toBe(true);     // title
    expect(memberMatchesQuery(jordan, 'north')).toBe(true);      // chapter
  });

  test('a multi-word query requires EVERY word to match somewhere (AND across fields)', () => {
    // "north bank" — chapter North + 'bank' in company/industry
    expect(memberMatchesQuery(jordan, 'north bank')).toBe(true);
    expect(memberMatchesQuery(riley, 'north bank')).toBe(false);
    expect(memberMatchesQuery(riley, 'north roof')).toBe(true);
    expect(memberMatchesQuery(jordan, 'banking manager')).toBe(true); // industry + title
  });

  test('a term that appears in no field fails the whole match', () => {
    expect(memberMatchesQuery(jordan, 'dentist')).toBe(false);
    expect(memberMatchesQuery(jordan, 'north dentist')).toBe(false);
  });
});
