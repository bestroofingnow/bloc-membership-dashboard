import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
import { signToken } from '@/lib/guest/tokens';
import type { QrTokenKind } from '@/lib/guest/types';

const mintSchema = z.object({
  kind: z.enum(['general', 'chapter', 'event', 'member_invite', 'after_hours']),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']).nullable().optional(),
  event_id: z.string().uuid().nullable().optional(),
  invited_by_member_id: z.string().uuid().nullable().optional(),
  label: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = mintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  // Directors can only mint for their own chapter (or null = cross-chapter)
  if (profile.role === 'chapter_director' && p.chapter && p.chapter !== profile.chapter) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const sb = getServerSupabase();
  // Validate event/member references when supplied; directors get chapter-scoped check
  if (p.event_id) {
    const { data: ev } = await sb.from('events').select('chapter').eq('id', p.event_id).maybeSingle();
    if (!ev) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
    if (profile.role === 'chapter_director' && ev.chapter && ev.chapter !== profile.chapter) {
      return NextResponse.json({ error: 'forbidden_event_chapter' }, { status: 403 });
    }
  }
  if (p.invited_by_member_id) {
    const { data: m } = await sb.from('members').select('chapter').eq('id', p.invited_by_member_id).maybeSingle();
    if (!m) return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
    if (profile.role === 'chapter_director' && m.chapter && m.chapter !== profile.chapter) {
      return NextResponse.json({ error: 'forbidden_member_chapter' }, { status: 403 });
    }
  }

  // Insert with a unique placeholder, then update with the real signed token.
  const placeholder = `pending-${crypto.randomUUID()}`;
  const { data: row, error: insErr } = await sb
    .from('qr_tokens')
    .insert({
      token: placeholder,
      kind: p.kind,
      chapter: p.chapter ?? null,
      event_id: p.event_id ?? null,
      invited_by_member_id: p.invited_by_member_id ?? null,
      label: p.label ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    console.error('qr_tokens insert', insErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const token = await signToken({
    kind: p.kind as QrTokenKind,
    chapter: p.chapter ?? undefined,
    event_id: p.event_id ?? undefined,
    invited_by_member_id: p.invited_by_member_id ?? undefined,
    qr_id: row.id,
  });
  await sb.from('qr_tokens').update({ token }).eq('id', row.id);

  return NextResponse.json({ id: row.id, token, url: `/guest/i/${token}` });
}
