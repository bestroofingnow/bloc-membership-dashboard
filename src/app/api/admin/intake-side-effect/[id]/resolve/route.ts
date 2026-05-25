import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

interface Props { params: Promise<{ id: string }> }

/**
 * Mark all unresolved side-effect failures for a given RSVP as resolved.
 * The caller has manually fixed the issue (e.g. re-pushed to GHL, resent email)
 * and is acknowledging it.
 */
export async function POST(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: rsvpId } = await params;
  const sb = getServerSupabase();

  // Directors can only act on RSVPs in their chapter.
  if (profile.role === 'chapter_director') {
    const { data: rsvp } = await sb
      .from('intake_rsvps')
      .select('id,events!inner(chapter)')
      .eq('id', rsvpId)
      .maybeSingle();
    const eventChapter = (rsvp as unknown as { events: { chapter: string | null } } | null)?.events?.chapter ?? null;
    if (!rsvp || eventChapter !== profile.chapter) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const { error: upErr } = await sb
    .from('intake_side_effect_failures')
    .update({ resolved_at: new Date().toISOString() })
    .eq('rsvp_id', rsvpId)
    .is('resolved_at', null);
  if (upErr) {
    console.error('intake_side_effect_failures resolve', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
