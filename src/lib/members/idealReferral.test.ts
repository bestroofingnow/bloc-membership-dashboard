import { describe, test, expect } from 'vitest';
import { validateIdealReferral, IDEAL_REFERRAL_MAX } from './idealReferral';

describe('validateIdealReferral()', () => {
  test('empty / null / undefined is allowed (optional field)', () => {
    expect(validateIdealReferral('').ok).toBe(true);
    expect(validateIdealReferral(null).ok).toBe(true);
    expect(validateIdealReferral(undefined).ok).toBe(true);
    expect(validateIdealReferral('   ').ok).toBe(true);
  });

  test('a normal blurb is valid', () => {
    expect(validateIdealReferral('Homeowners in Charlotte needing a new roof').ok).toBe(true);
  });

  test('rejects an over-long blurb', () => {
    const tooLong = 'x'.repeat(IDEAL_REFERRAL_MAX + 1);
    const r = validateIdealReferral(tooLong);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/under/i);
  });

  test('exactly the max length is allowed', () => {
    expect(validateIdealReferral('x'.repeat(IDEAL_REFERRAL_MAX)).ok).toBe(true);
  });
});
