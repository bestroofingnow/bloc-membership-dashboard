import { SignJWT, jwtVerify } from 'jose';
import type { QrTokenPayload } from './types';

function getSecret(): Uint8Array {
  const raw = process.env.GUEST_TOKEN_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('GUEST_TOKEN_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(raw);
}

export async function signToken(
  payload: Omit<QrTokenPayload, 'iat'>,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<QrTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as QrTokenPayload;
  } catch {
    return null;
  }
}
