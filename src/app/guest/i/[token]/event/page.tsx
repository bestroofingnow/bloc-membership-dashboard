import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props { params: Promise<{ token: string }> }

export default async function EventPickerPage({ params }: Props) {
  const { token } = await params;
  const { payload } = await resolveToken(token);

  if (payload.event_id) {
    // Token already pinned event; skip ahead via a server redirect.
    const next = payload.chapter ? 'details' : 'chapter';
    redirect(`/guest/i/${token}/${next}`);
  }

  const sb = getServerSupabase();
  let q = sb
    .from('events')
    .select('id,title,description,location_name,starts_at,chapter,kind')
    .eq('public_visible', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (payload.chapter) q = q.eq('chapter', payload.chapter);
  const { data: events } = await q;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Pick an event</h1>
      <ul className="mt-6 space-y-4">
        {(events ?? []).map((e) => (
          <li key={e.id} className="rounded border p-4">
            <Link href={`/guest/i/${token}/${payload.chapter ? 'details' : 'chapter'}?event=${e.id}`} className="block">
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-gray-600">{new Date(e.starts_at).toLocaleString()}</div>
              {e.location_name && <div className="text-sm text-gray-600">{e.location_name}</div>}
            </Link>
          </li>
        ))}
        {events?.length === 0 && <li className="text-gray-600">No upcoming events.</li>}
      </ul>
    </main>
  );
}
