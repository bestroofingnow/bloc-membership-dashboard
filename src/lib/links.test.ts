import { describe, test, expect } from 'vitest';
import { guestInviteUrl, memberInviteUrl, cleanOrigin } from './links';

describe('cleanOrigin()', () => {
  test('removes a trailing slash and surrounding whitespace', () => {
    expect(cleanOrigin('https://bloc.app/')).toBe('https://bloc.app');
    expect(cleanOrigin('  https://bloc.app  ')).toBe('https://bloc.app');
    expect(cleanOrigin('https://bloc.app')).toBe('https://bloc.app');
  });
});

describe('guestInviteUrl() — the QR target', () => {
  test('builds /guest/i/<token>', () => {
    expect(guestInviteUrl('https://bloc.app', 'aaa.bbb.ccc')).toBe('https://bloc.app/guest/i/aaa.bbb.ccc');
  });

  test('strips ANY whitespace from the token so the QR/url never breaks', () => {
    // The reported bug: a stray space inside the encoded token broke the QR.
    expect(guestInviteUrl('https://bloc.app', 'aaa.bbb .ccc')).toBe('https://bloc.app/guest/i/aaa.bbb.ccc');
    expect(guestInviteUrl('https://bloc.app', '  aaa.bbb.ccc \n')).toBe('https://bloc.app/guest/i/aaa.bbb.ccc');
  });

  test('does not produce a double slash when origin has a trailing slash', () => {
    expect(guestInviteUrl('https://bloc.app/', 'tok')).toBe('https://bloc.app/guest/i/tok');
  });

  test('the result never contains whitespace', () => {
    expect(/\s/.test(guestInviteUrl('https://bloc.app ', ' to k '))).toBe(false);
  });
});

describe('memberInviteUrl() — the attributed join link', () => {
  test('builds /join?ref=<memberId>', () => {
    expect(memberInviteUrl('https://bloc.app', '11111111-1111-1111-1111-111111111111'))
      .toBe('https://bloc.app/join?ref=11111111-1111-1111-1111-111111111111');
  });

  test('strips whitespace from the member id and never contains whitespace', () => {
    const url = memberInviteUrl('https://bloc.app/', '  1111-2222 ');
    expect(url).toBe('https://bloc.app/join?ref=1111-2222');
    expect(/\s/.test(url)).toBe(false);
  });
});
