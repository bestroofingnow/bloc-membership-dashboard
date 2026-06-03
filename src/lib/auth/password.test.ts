import { describe, test, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from './password';

describe('password length policy', () => {
  test('minimum is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
  test('rejects 7, accepts 8', () => {
    expect(validatePasswordLength('1234567')).toBe(false);
    expect(validatePasswordLength('12345678')).toBe(true);
  });
});
