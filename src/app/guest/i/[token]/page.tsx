import Link from 'next/link';
import { resolveToken } from './_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props { params: Promise<{ token: string }> }

export default async function GuestLandingPage({ params }: Props) {
  const { token } = await params;
  const { payload } = await resolveToken(token);
  const sb = getServerSupabase();

  let event = null;
  if (payload.event_id) {
    const { data } = await sb.from('events')
      .select('id,title,starts_at,location_name')
      .eq('id', payload.event_id).single();
    event = data;
  }

  let inviter = null;
  if (payload.invited_by_member_id) {
    const { data } = await sb.from('members')
      .select('full_name')
      .eq('id', payload.invited_by_member_id).single();
    inviter = data;
  }

  const nextStep =
    !payload.event_id ? `event` :
    !payload.chapter ? `chapter` :
    `details`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Welcome to BLOC</h1>
      {inviter && (
        <p className="mt-2 text-gray-700">{inviter.full_name} invited you.</p>
      )}
      {payload.chapter && (
        <p className="mt-1 text-gray-700">Chapter: <strong>{payload.chapter}</strong></p>
      )}
      {event && (
        <p className="mt-1 text-gray-700">
          Event: <strong>{event.title}</strong> on {new Date(event.starts_at).toLocaleString()}
        </p>
      )}
      <Link href={`/guest/i/${token}/${nextStep}`} className="mt-8 inline-block rounded bg-black px-6 py-3 text-white">
        Continue
      </Link>
    </main>
  );
}
