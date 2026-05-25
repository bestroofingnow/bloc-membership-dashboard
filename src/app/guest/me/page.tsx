import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export default async function MePage() {
  const cookieStore = await cookies();
  const guestId = cookieStore.get('intake_guest_id')?.value;
  if (!guestId) redirect('/guest/error/bad-link');

  const sb = getServerSupabase();
  const { data: guest } = await sb
    .from('intake_guests')
    .select('first_name')
    .eq('id', guestId)
    .maybeSingle();

  const { data: rsvps } = await sb
    .from('intake_rsvps')
    .select('id,status,events!inner(title,starts_at,location_name)')
    .eq('guest_id', guestId)
    .order('submitted_at', { ascending: false });

  const hasRsvps = (rsvps ?? []).length > 0;
  const firstName = guest?.first_name ?? '';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {firstName ? `Hi ${firstName} — your RSVPs` : 'Your RSVPs'}
      </h1>
      {hasRsvps ? (
        <ul className="mt-6 space-y-3">
          {(rsvps ?? []).map((r) => {
            const ev = (r as unknown as { events: { title: string; starts_at: string; location_name: string | null } }).events;
            return (
              <li key={r.id} className="rounded border p-4">
                <div className="font-medium">{ev.title}</div>
                <div className="text-sm text-gray-600">
                  {new Date(ev.starts_at).toLocaleString()}{ev.location_name ? ` · ${ev.location_name}` : ''}
                </div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">{r.status}</div>
                <a href={`/api/guest/ics/${r.id}`} download="event.ics" className="text-sm underline">Add to calendar</a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded border border-dashed p-8 text-center">
          <p className="text-gray-700 font-medium">You don&apos;t have any RSVPs yet.</p>
          <p className="mt-2 text-sm text-gray-600">
            Scan a QR code at a BLOC event or ask a member for their invite link to register.
          </p>
          <Link href="/guest" className="mt-4 inline-block text-sm underline">
            Browse upcoming events
          </Link>
        </div>
      )}
    </main>
  );
}
