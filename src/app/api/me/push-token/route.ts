import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export const runtime = 'nodejs';

const schema = z.object({
  expo_push_token: z.string().min(10).max(255),
  platform: z.string().max(20).optional(),
});

/**
 * Member self-service: register this device's Expo push token. Identified by auth
 * email → members.email. Upserts on the token (which is globally unique) so a device
 * that signs in as a different member re-points to them.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const sb = getServerSupabase();
  const { data: memRow } = await sb
    .from('members')
    .select('id')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });

  const { error } = await sb.from('push_tokens').upsert(
    {
      member_id: memRow.id,
      expo_push_token: parsed.data.expo_push_token,
      platform: parsed.data.platform ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );
  if (error) {
    console.error('me push-token upsert', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
