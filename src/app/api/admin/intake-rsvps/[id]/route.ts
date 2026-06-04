import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
import { linkLead } from '@/lib/leads/linkLead';

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

  // When marked attended, advance the linked lead forward-only to 'attended'.
  // link_lead is idempotent and re-uses the lead already linked to this rsvp row;
  // non-blocking so a spine hiccup never fails the status update.
  if (parsed.data.status === 'attended') {
    const { data: rsvpRow } = await sb
      .from('intake_rsvps')
      .select('id,guest_id,invited_by_member_id,intake_guests!inner(email,first_name,last_name,business_name)')
      .eq('id', id)
      .maybeSingle();
    const ig = (rsvpRow as unknown as {
      guest_id: string;
      invited_by_member_id: string | null;
      intake_guests: { email: string; first_name: string; last_name: string; business_name: string };
    } | null);
    if (ig) {
      await linkLead(sb, {
        source_table: 'intake_rsvps',
        source_id: id,
        email: ig.intake_guests.email,
        name: `${ig.intake_guests.first_name} ${ig.intake_guests.last_name}`,
        company: ig.intake_guests.business_name,
        source: 'qr_rsvp',
        stage: 'attended',
        invited_by_member_id: ig.invited_by_member_id ?? null,
        actor_profile_id: profile.id,
        note: 'rsvp marked attended',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
