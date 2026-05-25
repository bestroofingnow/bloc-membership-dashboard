import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/guest/tokens';
import type { QrTokenPayload } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export type WizardStep = 'landing' | 'event' | 'chapter' | 'details';

export interface ResolvedToken {
  payload: QrTokenPayload;
  qr_token_id: string;
  session_id: string;
}

/**
 * Verify a token, look up its DB row, bump scan_count, and ensure a wizard session exists.
 * Optionally records the current step the guest is on for dashboard visibility.
 * Redirects to error pages on failure.
 */
export async function resolveToken(
  token: string,
  step: WizardStep = 'landing',
): Promise<ResolvedToken> {
  const payload = await verifyToken(token);
  if (!payload) redirect('/guest/error/bad-link');

  const sb = getServerSupabase();
  const { data: row } = await sb
    .from('qr_tokens')
    .select('id,revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!row) redirect('/guest/error/bad-link');
  if (row.revoked_at) redirect('/guest/error/expired-link');

  // Atomic increment via SQL function — avoids the TOCTOU race the prior
  // select-then-update had under concurrent scans.
  await sb.rpc('qr_token_bump_scan', { p_qr_id: row.id });

  // Ensure a session row exists; cookie holds its id.
  const cookieStore = await cookies();
  let sessionId = cookieStore.get('gsid')?.value;
  let sessionExists = false;
  if (sessionId) {
    const { data: s } = await sb
      .from('intake_sessions')
      .select('id')
      .eq('id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    sessionExists = !!s;
  }
  if (!sessionExists) {
    const { data: created } = await sb
      .from('intake_sessions')
      .insert({
        token,
        current_step: step,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    sessionId = created!.id;
    // secure when running over HTTPS — covers prod and staging behind a TLS proxy
    const h = await headers();
    const isHttps = (h.get('x-forwarded-proto') ?? 'http').toLowerCase().includes('https')
      || process.env.NODE_ENV === 'production';
    cookieStore.set('gsid', sessionId!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
      maxAge: 24 * 60 * 60,
    });
  } else {
    // Session already exists — bump current_step to reflect progress.
    await sb.from('intake_sessions').update({ current_step: step }).eq('id', sessionId!);
  }

  return { payload, qr_token_id: row.id, session_id: sessionId! };
}
