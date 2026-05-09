import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { GuestDetailsForm } from './GuestDetailsForm';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ event?: string }>;
}

export default async function DetailsPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const { payload, qr_token_id, session_id } = await resolveToken(token);

  const sb = getServerSupabase();
  const [{ data: industries }, { data: categories }] = await Promise.all([
    sb.from('industry_categories').select('id,name,display_order').order('display_order'),
    sb.from('industry_targets').select('id,category_id,title').order('title'),
  ]);

  const event_id = payload.event_id ?? sp.event ?? null;
  if (!event_id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>Please pick an event first. <a href={`/guest/i/${token}/event`}>Go back</a></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your details</h1>
      <GuestDetailsForm
        token={token}
        sessionId={session_id}
        chapter={payload.chapter ?? 'Uptown'}
        eventId={event_id}
        invitedByMemberId={payload.invited_by_member_id ?? null}
        qrTokenId={qr_token_id}
        industries={(industries ?? []).map((i) => ({ id: i.id, name: i.name }))}
        categories={(categories ?? []).map((c) => ({ id: c.id, industry_id: c.category_id, name: c.title }))}
      />
    </main>
  );
}
