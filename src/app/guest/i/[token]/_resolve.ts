import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/guest/tokens';
import type { QrTokenPayload } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export interface ResolvedToken {
  payload: QrTokenPayload;
  qr_token_id: string;
  session_id: string;
}

/**
 * Verify a token, look up its DB row, bump scan_count, and ensure a wizard session exists.
 * Redirects to error pages on failure.
 */
export async function resolveToken(token: string): Promise<ResolvedToken> {
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

  const { data: current } = await sb
    .from('qr_tokens')
    .select('scan_count')
    .eq('id', row.id)
    .single();
  await sb
    .from('qr_tokens')
    .update({
      scan_count: (current?.scan_count ?? 0) + 1,
      last_scanned_at: new Date().toISOString(),
    })
    .eq('id', row.id);

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
        current_step: 'landing',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    sessionId = created!.id;
    cookieStore.set('gsid', sessionId!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
  }

  return { payload, qr_token_id: row.id, session_id: sessionId! };
}
