import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const patchSchema = z.object({
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']).nullable().optional(),
  kind: z.enum(['lunch', 'after_hours', 'special']).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
  location_name: z.string().max(200).nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  public_url: z.string().max(2048).nullable().optional(),
  public_visible: z.boolean().optional(),
});

interface Props { params: Promise<{ id: string }> }

async function loadEventForActor(id: string, profile: { role: string; chapter: string | null }) {
  const sb = getServerSupabase();
  const { data: event } = await sb.from('events').select('id,chapter').eq('id', id).maybeSingle();
  if (!event) return { event: null as null, error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  if (profile.role === 'chapter_director' && event.chapter && event.chapter !== profile.chapter) {
    return { event: null as null, error: NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 }) };
  }
  return { event, error: null as null };
}

export async function PATCH(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const { error: authErr } = await loadEventForActor(id, profile);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.starts_at && parsed.data.ends_at && new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    return NextResponse.json({ error: 'ends_before_starts' }, { status: 400 });
  }

  const sb = getServerSupabase();
  const { error: upErr } = await sb.from('events').update(parsed.data).eq('id', id);
  if (upErr) {
    console.error('events update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const { error: authErr } = await loadEventForActor(id, profile);
  if (authErr) return authErr;

  const sb = getServerSupabase();
  // Refuse if any RSVPs exist (FK uses ON DELETE RESTRICT anyway, but cleaner error)
  const { count: rsvpCount } = await sb
    .from('intake_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);
  if ((rsvpCount ?? 0) > 0) {
    return NextResponse.json({ error: 'has_rsvps', detail: 'Cannot delete event with RSVPs. Mark public_visible=false instead.' }, { status: 409 });
  }

  const { error: delErr } = await sb.from('events').delete().eq('id', id);
  if (delErr) {
    console.error('events delete', delErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
