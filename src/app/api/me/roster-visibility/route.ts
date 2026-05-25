import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';

const schema = z.object({
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  visible: z.boolean(),
  public_business_name: z.string().max(200).nullable().optional(),
  public_category_id: z.string().uuid().nullable().optional(),
});

/**
 * Member self-service: any authenticated user can toggle their OWN row
 * in chapter_member_visibility. The member is identified by matching their
 * auth email to `members.email` (case-insensitive). They cannot touch any
 * other member's row.
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

  // Find the caller's member record by email (case-insensitive)
  const { data: memRow } = await sb
    .from('members')
    .select('id,chapter')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) {
    return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });
  }

  // Only allow toggling visibility in the member's own chapter
  if (memRow.chapter !== p.chapter) {
    return NextResponse.json({ error: 'chapter_mismatch' }, { status: 403 });
  }

  const { error: upErr } = await sb
    .from('chapter_member_visibility')
    .upsert({
      member_id: memRow.id,
      chapter: p.chapter,
      visible: p.visible,
      public_business_name: p.public_business_name ?? null,
      public_category_id: p.public_category_id ?? null,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id,chapter' });
  if (upErr) {
    console.error('me roster-visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
