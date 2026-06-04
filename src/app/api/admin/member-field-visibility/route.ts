import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const schema = z.object({
  member_id: z.string().uuid(),
  show_mobile_phone: z.boolean(),
  show_address: z.boolean(),
  show_birthday: z.boolean(),
});

/**
 * Admin/director edits of ANOTHER member's field-visibility flags.
 * Admins may edit anyone; directors only members in their own chapter.
 * Mirrors the chapter-scope guard from /api/admin/chapter-visibility.
 */
export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // Resolve the target member's chapter for the director scope check.
  const { data: target } = await sb
    .from('members')
    .select('id,chapter')
    .eq('id', p.member_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  const inScope = profile.role === 'admin' || profile.chapter === target.chapter;
  if (!inScope) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const { error: upErr } = await sb
    .from('member_field_visibility')
    .upsert({
      member_id: p.member_id,
      show_mobile_phone: p.show_mobile_phone,
      show_address: p.show_address,
      show_birthday: p.show_birthday,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id' });
  if (upErr) {
    console.error('admin member-field-visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
