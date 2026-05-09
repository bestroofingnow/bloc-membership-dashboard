import { getServerSupabase } from '@/lib/guest/supabase-server';

export default async function GuestRootPage() {
  const sb = getServerSupabase();
  const { data: events } = await sb
    .from('events')
    .select('id,title,starts_at,location_name,chapter')
    .eq('public_visible', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Visit BLOC as a guest</h1>
      <p className="mt-3 text-gray-700">Pick an upcoming event to RSVP to.</p>
      <p className="mt-6 text-sm text-gray-600">To register, scan the QR code at any BLOC event or ask the member who invited you for their personal QR link.</p>
      <ul className="mt-6 space-y-3">
        {(events ?? []).map((e) => (
          <li key={e.id} className="rounded border p-4">
            <div className="font-medium">{e.title}</div>
            <div className="text-sm text-gray-600">
              {new Date(e.starts_at).toLocaleString()}{e.location_name ? ` · ${e.location_name}` : ''}
              {e.chapter && ` · BLOC ${e.chapter}`}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
