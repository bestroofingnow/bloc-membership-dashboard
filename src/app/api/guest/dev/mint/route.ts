import { NextResponse } from 'next/server';
import { signToken } from '@/lib/guest/tokens';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import type { ChapterCode, QrTokenKind } from '@/lib/guest/types';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const kind: QrTokenKind = body.kind ?? 'general';
  const chapter: ChapterCode | undefined = body.chapter;
  const event_id: string | undefined = body.event_id;
  const invited_by_member_id: string | undefined = body.invited_by_member_id;
  const label: string | undefined = body.label;

  const sb = getServerSupabase();
  // Insert with a unique placeholder, then update to the real signed token
  const placeholder = `pending-${crypto.randomUUID()}`;
  const { data: row } = await sb
    .from('qr_tokens')
    .insert({
      token: placeholder,
      kind,
      chapter,
      event_id,
      invited_by_member_id,
      label: label ?? `dev-${new Date().toISOString()}`,
    })
    .select('id')
    .single();
  if (!row) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const token = await signToken({ kind, chapter, event_id, invited_by_member_id, qr_id: row.id });
  await sb.from('qr_tokens').update({ token }).eq('id', row.id);

  return NextResponse.json({ token, url: `/guest/i/${token}` });
}
