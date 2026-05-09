import { randomBytes, createHash } from 'crypto';

export interface MagicMint {
  token: string;
  hash: string;
  expires_at: Date;
}

export function mintMagic(opts: { ttlDays: number }): MagicMint {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashMagic(token),
    expires_at: new Date(Date.now() + opts.ttlDays * 24 * 60 * 60 * 1000),
  };
}

export function hashMagic(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
