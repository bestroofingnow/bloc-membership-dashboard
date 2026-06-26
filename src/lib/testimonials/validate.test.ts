import { describe, test, expect } from 'vitest';
import { validateTestimonial, countAboutMember, TESTIMONIAL_MAX } from './validate';

const base = { authorMemberId: 'a', subjectMemberId: 'b', body: 'Great partner, sent me 3 clients.' };

describe('validateTestimonial()', () => {
  test('a normal testimonial is valid', () => {
    expect(validateTestimonial(base).ok).toBe(true);
  });

  test('requires an author and a subject', () => {
    expect(validateTestimonial({ ...base, authorMemberId: null }).ok).toBe(false);
    expect(validateTestimonial({ ...base, subjectMemberId: null }).ok).toBe(false);
  });

  test('rejects a self-testimonial', () => {
    const r = validateTestimonial({ ...base, subjectMemberId: 'a' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/yourself/i);
  });

  test('rejects empty / whitespace-only body', () => {
    expect(validateTestimonial({ ...base, body: '' }).ok).toBe(false);
    expect(validateTestimonial({ ...base, body: '   ' }).ok).toBe(false);
  });

  test('rejects an over-long body', () => {
    expect(validateTestimonial({ ...base, body: 'x'.repeat(TESTIMONIAL_MAX + 1) }).ok).toBe(false);
  });
});

describe('countAboutMember()', () => {
  const rows = [
    { author_member_id: 'a', subject_member_id: 'b' },
    { author_member_id: 'c', subject_member_id: 'b' },
    { author_member_id: 'a', subject_member_id: 'd' },
  ];
  test('counts testimonials written about a member', () => {
    expect(countAboutMember(rows, 'b')).toBe(2);
    expect(countAboutMember(rows, 'd')).toBe(1);
    expect(countAboutMember(rows, 'zzz')).toBe(0);
  });
});
