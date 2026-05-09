import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/guest/supabase-server';

export default async function MePage() {
  const cookieStore = await cookies();
  const guestId = cookieStore.get('intake_guest_id')?.value;
  if (!guestId) redirect('/guest/error/bad-link');

  const sb = getServerSupabase();
  const { data: rsvps } = await sb
    .from('intake_rsvps')
    .select('id,status,events!inner(title,starts_at,location_name)')
    .eq('guest_id', guestId)
    .order('submitted_at', { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your RSVPs</h1>
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
    </main>
  );
}
