import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';

const schema = z.object({
  show_mobile_phone: z.boolean(),
  show_address: z.boolean(),
  show_birthday: z.boolean(),
});

/**
 * Member self-service: any authenticated user toggles their OWN row in
 * member_field_visibility. Identified by matching their auth email to
 * members.email (case-insensitive). They cannot touch another member's flags.
 * Pattern copied verbatim from /api/me/roster-visibility.
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

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // Find the caller's member record by email (case-insensitive).
  const { data: memRow } = await sb
    .from('members')
    .select('id')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) {
    return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });
  }

  const { error: upErr } = await sb
    .from('member_field_visibility')
    .upsert({
      member_id: memRow.id,
      show_mobile_phone: p.show_mobile_phone,
      show_address: p.show_address,
      show_birthday: p.show_birthday,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id' });
  if (upErr) {
    console.error('me field-visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
