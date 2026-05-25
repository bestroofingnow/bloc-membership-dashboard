import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const patchSchema = z.object({
  status: z.enum(['registered', 'attended', 'no_show', 'canceled']).optional(),
  notes: z.string().max(2000).nullable().optional(),
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

  // Directors can only act on RSVPs for their own chapter's events.
  if (profile.role === 'chapter_director') {
    const { data: rsvp } = await sb
      .from('intake_rsvps')
      .select('id,events!inner(chapter)')
      .eq('id', id)
      .maybeSingle();
    const eventChapter = (rsvp as unknown as { events: { chapter: string | null } } | null)?.events?.chapter ?? null;
    if (!rsvp || eventChapter !== profile.chapter) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const { error: upErr } = await sb.from('intake_rsvps').update(update).eq('id', id);
  if (upErr) {
    console.error('intake_rsvps update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
