import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const patchSchema = z.object({
  revoked: z.boolean(),
  label: z.string().max(200).nullable().optional(),
});

interface Props { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }

  const sb = getServerSupabase();
  const { data: existing } = await sb.from('qr_tokens').select('id,chapter').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (profile.role === 'chapter_director' && existing.chapter && existing.chapter !== profile.chapter) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const update: Record<string, unknown> = {
    revoked_at: parsed.data.revoked ? new Date().toISOString() : null,
  };
  if (parsed.data.label !== undefined) update.label = parsed.data.label;

  const { error: upErr } = await sb.from('qr_tokens').update(update).eq('id', id);
  if (upErr) {
    console.error('qr_tokens update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
