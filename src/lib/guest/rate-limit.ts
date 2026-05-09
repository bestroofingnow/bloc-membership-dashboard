import { getServerSupabase } from './supabase-server';

export interface RateLimitOpts {
  bucket: string;        // e.g. `submit:${ip}`
  limit: number;         // max events per window
  windowSeconds: number; // window size
}

/**
 * Atomic-ish window counter. Uses a single SQL upsert.
 * Returns true if the action is allowed (under limit), false if rate-limited.
 */
export async function rateLimit(opts: RateLimitOpts): Promise<boolean> {
  const sb = getServerSupabase();
  const windowStart = new Date(
    Math.floor(Date.now() / (opts.windowSeconds * 1000)) * opts.windowSeconds * 1000,
  );
  // Upsert + return current count
  const { data, error } = await sb.rpc('intake_rate_limit_bump', {
    p_bucket: opts.bucket,
    p_window_start: windowStart.toISOString(),
  });
  if (error) {
    // Fail-open: if rate-limit infra is broken, don't block the user.
    console.error('rate_limit error', error);
    return true;
  }
  return (data as number) <= opts.limit;
}

export function ipFromHeaders(h: Headers): string {
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    '0.0.0.0'
  );
}
