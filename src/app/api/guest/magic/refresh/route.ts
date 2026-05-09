import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { mintMagic } from '@/lib/guest/magic';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const ok = await rateLimit({ bucket: `magic-refresh:${ip}`, limit: 3, windowSeconds: 600 });
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  // Always 200 to prevent enumeration.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const sb = getServerSupabase();
  const emailNormalized = parsed.data.email.trim().toLowerCase();
  const { data: guest } = await sb
    .from('intake_guests')
    .select('id,first_name,email')
    .eq('email_normalized', emailNormalized)
    .maybeSingle();

  if (!guest) return NextResponse.json({ ok: true });

  const magic = mintMagic({ ttlDays: 30 });
  await sb
    .from('intake_guests')
    .update({ magic_token_hash: magic.hash, magic_expires_at: magic.expires_at.toISOString() })
    .eq('id', guest.id);

  try {
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;
    // Reuse the confirmation template; send a stripped version with no event.
    // For MVP, send a minimal email via fetch directly; a dedicated template can come later.
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_ADDRESS ?? 'no-reply@businessleadersofcharlotte.com',
        to: guest.email,
        subject: 'Your BLOC link',
        html: `<p>Hi ${guest.first_name}, <a href="${origin}/guest/me?t=${magic.token}">click here to access your RSVPs</a>.</p>`,
      }),
    });
  } catch (e) {
    // Swallow: still return 200 to user.
    console.error('magic refresh email', e);
  }

  return NextResponse.json({ ok: true });
}
