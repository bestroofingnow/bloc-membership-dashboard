import { describe, test, expect } from 'vitest';
import { humanError } from './errors';

describe('humanError()', () => {
  test('rate_limited has a helpful message', () => {
    expect(humanError('rate_limited')).toMatch(/wait a minute/i);
  });

  test('bad_request mentions checking entries', () => {
    expect(humanError('bad_request')).toMatch(/check your entries/i);
  });

  test('three token errors all map to the same invalid-link copy', () => {
    const a = humanError('invalid_token');
    const b = humanError('token_chapter_mismatch');
    const c = humanError('token_event_mismatch');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/invalid or expired/i);
  });

  test('event_not_found and event_closed both say event not accepting', () => {
    expect(humanError('event_not_found')).toMatch(/no longer accepting/i);
    expect(humanError('event_closed')).toMatch(/no longer accepting/i);
  });

  test('db_error suggests retry', () => {
    expect(humanError('db_error')).toMatch(/try again/i);
  });

  test('network_error mentions connection', () => {
    expect(humanError('network_error')).toMatch(/connection/i);
  });

  test('unknown code falls back to generic message', () => {
    expect(humanError('totally_made_up')).toBe('Something went wrong. Please try again.');
  });

  test('empty string returns generic message', () => {
    expect(humanError('')).toMatch(/something went wrong/i);
  });
});
