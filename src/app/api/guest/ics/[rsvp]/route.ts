import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { buildIcs } from '@/lib/guest/ics';

interface Props { params: Promise<{ rsvp: string }> }

export async function GET(_: Request, { params }: Props) {
  const { rsvp } = await params;
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('intake_rsvps')
    .select('events!inner(title,description,location_name,location_address,starts_at,ends_at,ics_uid)')
    .eq('id', rsvp)
    .single();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ev = (data as unknown as { events: { title: string; description: string | null; location_name: string | null; location_address: string | null; starts_at: string; ends_at: string; ics_uid: string } }).events;
  const ics = buildIcs({
    uid: ev.ics_uid,
    title: ev.title,
    description: ev.description ?? undefined,
    location: ev.location_name ? `${ev.location_name}${ev.location_address ? `, ${ev.location_address}` : ''}` : ev.location_address ?? undefined,
    starts_at: new Date(ev.starts_at),
    ends_at: new Date(ev.ends_at),
  });
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event.ics"',
    },
  });
}
