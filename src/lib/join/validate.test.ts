import { describe, test, expect } from 'vitest';
import { parseJoinInput } from './validate';

describe('parseJoinInput() — simplified sign-up: name, phone, email, business name', () => {
  test('accepts name + business name + email and trims everything', () => {
    expect(parseJoinInput({ name: '  Pat Lee ', company: ' Lee Co ', email: ' pat@lee.com ', phone: '' })).toEqual({
      ok: true,
      value: { name: 'Pat Lee', company: 'Lee Co', email: 'pat@lee.com', phone: null },
    });
  });

  test('accepts a phone instead of an email', () => {
    const r = parseJoinInput({ name: 'Pat', company: 'Lee Co', phone: '704-555-0101' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBe('704-555-0101');
      expect(r.value.email).toBeNull();
    }
  });

  test('requires a name', () => {
    expect(parseJoinInput({ name: '   ', company: 'Lee Co', email: 'a@b.com' }))
      .toEqual({ ok: false, error: 'Please enter your name.' });
  });

  test('requires a business name', () => {
    expect(parseJoinInput({ name: 'Pat', company: '', email: 'a@b.com' }))
      .toEqual({ ok: false, error: 'Please enter your business name.' });
  });

  test('requires at least an email or a phone so we can reach them', () => {
    expect(parseJoinInput({ name: 'Pat', company: 'Lee Co' }))
      .toEqual({ ok: false, error: 'Please enter an email or phone number so we can reach you.' });
  });

  test('rejects an obviously invalid email', () => {
    expect(parseJoinInput({ name: 'Pat', company: 'Lee Co', email: 'not-an-email' }))
      .toEqual({ ok: false, error: 'Please enter a valid email address.' });
  });
});
