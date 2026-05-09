import { cookies } from 'next/headers';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}

export default async function ConfirmPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  if (!sp.rsvp) {
    return <main className="mx-auto max-w-2xl px-6 py-12"><p>Missing RSVP id.</p></main>;
  }
  const cookieStore = await cookies();
  const recentRsvp = cookieStore.get('intake_recent_rsvp')?.value;
  const guestIdCookie = cookieStore.get('intake_guest_id')?.value;
  const sb = getServerSupabase();
  const { data: rsvp } = await sb
    .from('intake_rsvps')
    .select('id,guest_id,events!inner(title,starts_at,location_name)')
    .eq('id', sp.rsvp)
    .maybeSingle();
  if (!rsvp) {
    return <main className="mx-auto max-w-2xl px-6 py-12"><p>RSVP not found.</p></main>;
  }
  const guestId = (rsvp as unknown as { guest_id: string }).guest_id;
  const authorized =
    recentRsvp === rsvp.id ||
    (!!guestIdCookie && guestId === guestIdCookie);
  if (!authorized) {
    return <main className="mx-auto max-w-2xl px-6 py-12"><p>Not authorized to view this RSVP.</p></main>;
  }
  const ev = (rsvp as unknown as { events: { title: string; starts_at: string; location_name: string | null } }).events;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">You're registered.</h1>
      <p className="mt-3 text-lg">{ev.title}</p>
      <p className="text-gray-600">{new Date(ev.starts_at).toLocaleString()}{ev.location_name ? ` · ${ev.location_name}` : ''}</p>
      <a
        href={`/api/guest/ics/${rsvp.id}`}
        download="event.ics"
        className="mt-8 inline-block rounded bg-black px-6 py-3 text-white"
      >
        Add to calendar
      </a>
      <p className="mt-6 text-sm text-gray-600">We've emailed your confirmation with the calendar invite attached.</p>
      <p className="mt-2 text-sm text-gray-600">Token: {token.slice(0, 8)}…</p>
    </main>
  );
}
