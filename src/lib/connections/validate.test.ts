import { describe, test, expect } from 'vitest';
import { validateConnection } from './validate';

describe('validateConnection()', () => {
  const ok = { contactName: 'Jane Doe', company: 'Acme', notes: 'Met at BLOCtail' };
  test('a complete connection is valid', () => {
    expect(validateConnection(ok).ok).toBe(true);
  });
  test('requires a contact name', () => {
    expect(validateConnection({ ...ok, contactName: '' }).ok).toBe(false);
    expect(validateConnection({ ...ok, contactName: '   ' }).ok).toBe(false);
  });
  test('caps contact name length', () => {
    expect(validateConnection({ ...ok, contactName: 'x'.repeat(121) }).ok).toBe(false);
  });
  test('caps notes length', () => {
    expect(validateConnection({ ...ok, notes: 'x'.repeat(1001) }).ok).toBe(false);
  });
  test('company/notes are optional', () => {
    expect(validateConnection({ contactName: 'Jane Doe' }).ok).toBe(true);
  });
});
