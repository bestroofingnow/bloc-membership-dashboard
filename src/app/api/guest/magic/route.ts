import { NextResponse } from 'next/server';
import { hashMagic } from '@/lib/guest/magic';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  if (!token) return NextResponse.redirect(new URL('/guest/error/bad-link', req.url));

  // Token-validation endpoint — throttle per IP so magic links can't be brute-forced.
  const ip = ipFromHeaders(req.headers);
  const allowed = await rateLimit({ bucket: `guest-magic:${ip}`, limit: 20, windowSeconds: 60 });
  if (!allowed) return NextResponse.redirect(new URL('/guest/error/bad-link', req.url));

  const sb = getServerSupabase();
  const hash = hashMagic(token);
  const { data: guest } = await sb
    .from('intake_guests')
    .select('id,magic_expires_at')
    .eq('magic_token_hash', hash)
    .maybeSingle();

  if (!guest) {
    return NextResponse.redirect(new URL('/guest/error/bad-link', req.url));
  }
  if (new Date(guest.magic_expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/guest/error/expired-link', req.url));
  }

  const res = NextResponse.redirect(new URL('/guest/me', req.url));
  res.cookies.set('intake_guest_id', guest.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
