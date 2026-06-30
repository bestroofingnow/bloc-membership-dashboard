import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { rateLimit } from '@/lib/guest/rate-limit';
import { validateIdealReferral, IDEAL_REFERRAL_MAX } from '@/lib/members/idealReferral';

const schema = z.object({
  ideal_referral: z.string().max(IDEAL_REFERRAL_MAX + 50).nullable(),
});

/**
 * Member self-service: set your OWN "ideal referral" blurb. The member is identified
 * by matching their auth email to members.email (case-insensitive); only that one row
 * is updated, and only the ideal_referral column — members cannot touch other fields
 * (those stay director-managed) or other members' rows.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await rateLimit({ bucket: `ideal:${userData.user.id}`, limit: 20, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'Too many updates. Please wait a minute.' }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const value = (parsed.data.ideal_referral ?? '').trim();
  const v = validateIdealReferral(value);
  if (!v.ok) return NextResponse.json({ error: v.error ?? 'invalid' }, { status: 400 });

  const sb = getServerSupabase();
  const { data: memRow } = await sb
    .from('members')
    .select('id')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });

  const { error: upErr } = await sb
    .from('members')
    .update({ ideal_referral: value || null })
    .eq('id', memRow.id);
  if (upErr) {
    console.error('me ideal-referral update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ideal_referral: value || null });
}
