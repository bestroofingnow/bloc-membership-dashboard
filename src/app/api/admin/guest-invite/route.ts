import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { getEmailClient } from '@/lib/guest/email';
import { buildIcs } from '@/lib/guest/ics';
import { requireDirector } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/guest/rate-limit';

export const maxDuration = 30; // bounds the email-send call

const schema = z.object({
  guest_id: z.string().uuid(),
  event_id: z.string().uuid(),
  custom_message: z.string().max(1000).optional(),
});

/**
 * Send a pipeline guest (from the kanban `guests` table) an event invite email
 * with an ICS attachment. Director+ only. Chapter-scoped: directors can only
 * invite to events in their own chapter (or cross-chapter / null chapter events).
 */
export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Sends an email — throttle to prevent abuse.
  const ok = await rateLimit({ bucket: `guest-invite:${profile.id}`, limit: 30, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'Too many invites. Please wait a minute.' }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const { guest_id, event_id, custom_message } = parsed.data;

  const sb = getServerSupabase();

  const { data: guest, error: guestErr } = await sb
    .from('guests')
    .select('id,name,company,email,invited_by')
    .eq('id', guest_id)
    .maybeSingle();
  if (guestErr || !guest) {
    return NextResponse.json({ error: 'guest_not_found' }, { status: 404 });
  }
  if (!guest.email) {
    return NextResponse.json({ error: 'guest_has_no_email' }, { status: 400 });
  }

  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id,title,description,starts_at,ends_at,location_name,location_address,ics_uid,chapter,public_visible')
    .eq('id', event_id)
    .maybeSingle();
  if (evErr || !event) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (profile.role === 'chapter_director' && event.chapter && event.chapter !== profile.chapter) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const ics = buildIcs({
    uid: event.ics_uid,
    title: event.title,
    description: event.description ?? undefined,
    location: event.location_name
      ? `${event.location_name}${event.location_address ? `, ${event.location_address}` : ''}`
      : event.location_address ?? undefined,
    starts_at: new Date(event.starts_at),
    ends_at: new Date(event.ends_at),
  });

  const email = getEmailClient();

  // Reuse the confirmation template but with invitation framing — the template
  // is generic enough since it already speaks of event + ICS attachment.
  // For now we use sendConfirmation with the custom_message folded into a no-op
  // magic_link (it's not relevant for kanban guests). A dedicated sendInvite
  // method can come later if we want different copy.
  try {
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;
    const first_name = (guest.name ?? '').split(' ')[0] || 'there';
    await email.sendConfirmation({
      to: guest.email,
      guest_first_name: first_name,
      event_title: `You're invited: ${event.title}`,
      event_starts_at: new Date(event.starts_at),
      event_location: event.location_name ?? event.location_address ?? '',
      ics_attachment: ics,
      // We use the same template; magic_link points back to the public site so the
      // recipient has a place to look up event details.
      magic_link: `${origin}/guest`,
    });
  } catch (e) {
    console.error('guest-invite email send', e);
    return NextResponse.json({ error: 'email_send_failed', detail: String(e) }, { status: 502 });
  }

  // Log on the guest's notes so the team has a paper trail.
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const invitedBy = profile.role === 'admin' ? 'admin' : `${profile.chapter ?? ''} director`;
  const noteLine = `\n[${stamp}] Invited to "${event.title}" by ${invitedBy}${custom_message ? ` — note: ${custom_message}` : ''}`;
  // Append rather than overwrite — fetch existing notes first.
  const { data: cur } = await sb.from('guests').select('notes').eq('id', guest_id).single();
  const newNotes = ((cur?.notes ?? '') + noteLine).trim();
  await sb.from('guests').update({ notes: newNotes }).eq('id', guest_id);

  return NextResponse.json({ ok: true });
}
