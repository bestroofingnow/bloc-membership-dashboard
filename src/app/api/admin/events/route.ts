import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const createSchema = z.object({
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']).nullable(),
  kind: z.enum(['lunch', 'after_hours', 'special']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  location_name: z.string().max(200).nullable(),
  location_address: z.string().max(500).nullable(),
  ics_uid: z.string().max(200).optional(),
  public_visible: z.boolean().default(true),
});

export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  // Directors can only create events for their own chapter (or cross-chapter null).
  if (profile.role === 'chapter_director' && p.chapter && p.chapter !== profile.chapter) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }
  if (new Date(p.ends_at) <= new Date(p.starts_at)) {
    return NextResponse.json({ error: 'ends_before_starts' }, { status: 400 });
  }

  const sb = getServerSupabase();
  const ics_uid = p.ics_uid ?? `event-${crypto.randomUUID()}@bloc`;
  const { data, error: insErr } = await sb
    .from('events')
    .insert({
      chapter: p.chapter,
      kind: p.kind,
      title: p.title,
      description: p.description,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
      location_name: p.location_name,
      location_address: p.location_address,
      ics_uid,
      public_visible: p.public_visible,
    })
    .select('id')
    .single();
  if (insErr || !data) {
    console.error('events insert', insErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
