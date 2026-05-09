import { NextResponse } from 'next/server';
import { z } from 'zod';
import { conflict } from '@/lib/guest/conflict';
import type { ChapterCode, MemberForConflict } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { getGhlClient } from '@/lib/guest/ghl';
import { getEmailClient } from '@/lib/guest/email';
import { buildIcs } from '@/lib/guest/ics';
import { mintMagic } from '@/lib/guest/magic';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const submitSchema = z.object({
  token: z.string(),
  session_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  business_name: z.string().min(1).max(200),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  event_id: z.string().uuid(),
  industry_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  other_category_text: z.string().max(200).nullable(),
  invited_by_member_id: z.string().uuid().nullable(),
  qr_token_id: z.string().uuid().nullable(),
}).refine(
  (d) => (d.industry_id && d.category_id) || (!!d.other_category_text),
  { message: 'Provide industry+category OR other_category_text' },
);

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const okMin = await rateLimit({ bucket: `submit:min:${ip}`, limit: 5, windowSeconds: 60 });
  const okHr = await rateLimit({ bucket: `submit:hr:${ip}`, limit: 20, windowSeconds: 3600 });
  if (!okMin || !okHr) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const p = parsed.data;
  const sb = getServerSupabase();

  // 1) Event must be public_visible and in the future.
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id,title,description,location_name,location_address,starts_at,ends_at,ics_uid,public_visible')
    .eq('id', p.event_id)
    .single();
  if (evErr || !event) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!event.public_visible || new Date(event.starts_at) < new Date()) {
    return NextResponse.json({ error: 'event_closed' }, { status: 410 });
  }

  // 2) Re-fetch members and compute conflict server-side (source of truth).
  const { data: members } = await sb
    .from('members')
    .select('id,chapter,industry_id,category_id,full_name,business_name')
    .eq('chapter', p.chapter);
  const cf = conflict({
    chapter: p.chapter as ChapterCode,
    industry_id: p.industry_id,
    category_id: p.category_id,
    members_in_chapter: (members ?? []) as MemberForConflict[],
  });

  // 3) Detect existing-member by email
  const emailNormalized = p.email.trim().toLowerCase();
  const { data: existingMember } = await sb
    .from('members')
    .select('id')
    .eq('email', emailNormalized)
    .maybeSingle();
  const isExistingMember = !!existingMember;

  // 4) Upsert intake_guest
  const { data: guest, error: guestErr } = await sb
    .from('intake_guests')
    .upsert(
      {
        email: p.email.trim(),
        email_normalized: emailNormalized,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        business_name: p.business_name.trim(),
        industry_id: p.industry_id,
        category_id: p.category_id,
        other_category_text: p.other_category_text?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email_normalized' },
    )
    .select('id')
    .single();
  if (guestErr || !guest) {
    console.error('intake_guests upsert', guestErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // 5) Idempotent RSVP insert; if existing canceled row, flip to registered.
  const { data: existingRsvp } = await sb
    .from('intake_rsvps')
    .select('id,status')
    .eq('guest_id', guest.id)
    .eq('event_id', p.event_id)
    .maybeSingle();

  let rsvpId: string;
  if (existingRsvp && existingRsvp.status !== 'canceled') {
    rsvpId = existingRsvp.id;
  } else if (existingRsvp && existingRsvp.status === 'canceled') {
    const { error: upErr } = await sb
      .from('intake_rsvps')
      .update({ status: 'registered', conflict_kind: cf.kind, conflict_member_id: cf.occupants[0]?.id ?? null })
      .eq('id', existingRsvp.id);
    if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    rsvpId = existingRsvp.id;
  } else {
    const { data: rsvp, error: rsErr } = await sb
      .from('intake_rsvps')
      .insert({
        guest_id: guest.id,
        event_id: p.event_id,
        qr_token_id: p.qr_token_id,
        invited_by_member_id: p.invited_by_member_id,
        conflict_kind: cf.kind,
        conflict_member_id: cf.occupants[0]?.id ?? null,
        status: 'registered',
        notes: isExistingMember ? 'existing-member' : null,
      })
      .select('id')
      .single();
    if (rsErr || !rsvp) {
      console.error('intake_rsvps insert', rsErr);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    rsvpId = rsvp.id;

    // conflict_log only on first insert
    await sb.from('intake_conflict_log').insert({
      rsvp_id: rsvpId,
      chapter: p.chapter,
      industry_id: p.industry_id,
      category_id: p.category_id,
      conflict_kind: cf.kind,
      occupants_snapshot: cf.occupants.map((m) => ({
        member_id: m.id,
        full_name: m.full_name,
        business_name: m.business_name,
        category_id: m.category_id,
      })),
    });
  }

  // 6) Magic link (only mint a fresh one — store hash on guest)
  const magic = mintMagic({ ttlDays: 30 });
  await sb
    .from('intake_guests')
    .update({
      magic_token_hash: magic.hash,
      magic_expires_at: magic.expires_at.toISOString(),
    })
    .eq('id', guest.id);

  // 7) Clean up the wizard session
  await sb.from('intake_sessions').delete().eq('id', p.session_id);

  // 8) Side effects (non-blocking — log failures, never throw)
  if (!isExistingMember) {
    try {
      const ghl = getGhlClient();
      const r = await ghl.upsertContact({
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        business_name: p.business_name,
        tags: ['guest-intake', `chapter:${p.chapter}`, `event:${event.id}`],
      });
      await sb.from('intake_guests').update({ ghl_contact_id: r.contact_id }).eq('id', guest.id);
    } catch (e) {
      await sb.from('intake_side_effect_failures').insert({
        rsvp_id: rsvpId,
        kind: 'ghl',
        error_msg: String(e),
      });
    }
  }

  try {
    const email = getEmailClient();
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
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`;
    await email.sendConfirmation({
      to: p.email,
      guest_first_name: p.first_name,
      event_title: event.title,
      event_starts_at: new Date(event.starts_at),
      event_location: event.location_name ?? event.location_address ?? '',
      ics_attachment: ics,
      magic_link: `${origin}/guest/me?t=${magic.token}`,
    });
  } catch (e) {
    await sb.from('intake_side_effect_failures').insert({
      rsvp_id: rsvpId,
      kind: 'email',
      error_msg: String(e),
    });
  }

  return NextResponse.json({ rsvp_id: rsvpId, conflict_kind: cf.kind });
}
