import { describe, test, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from './tokens';
import type { QrTokenPayload } from './types';

const SECRET = 'test-secret-do-not-use-in-prod-32chars-min';

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = SECRET;
});

const samplePayload: Omit<QrTokenPayload, 'iat'> = {
  kind: 'member_invite',
  chapter: 'Uptown',
  event_id: 'event-123',
  invited_by_member_id: 'member-42',
  qr_id: 'qr-abc',
};

describe('signToken / verifyToken', () => {
  test('round-trips a valid payload', async () => {
    const t = await signToken(samplePayload);
    const decoded = await verifyToken(t);
    expect(decoded).toMatchObject(samplePayload);
    expect(typeof decoded?.iat).toBe('number');
  });

  test('verifyToken with tampered payload returns null', async () => {
    const t = await signToken(samplePayload);
    const tampered = t.slice(0, -2) + 'AA';
    const decoded = await verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  test('verifyToken with valid signature but wrong secret returns null', async () => {
    const t = await signToken(samplePayload);
    process.env.GUEST_TOKEN_SECRET = 'a-different-secret-also-32-chars-long';
    const decoded = await verifyToken(t);
    expect(decoded).toBeNull();
    process.env.GUEST_TOKEN_SECRET = SECRET;
  });

  test('verifyToken with empty string returns null', async () => {
    const decoded = await verifyToken('');
    expect(decoded).toBeNull();
  });

  test('verifyToken with garbage returns null', async () => {
    const decoded = await verifyToken('not.a.valid.token');
    expect(decoded).toBeNull();
  });
});
