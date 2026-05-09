import Link from 'next/link';
import { resolveToken } from '../_resolve';
import { getServerSupabase } from '@/lib/guest/supabase-server';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ event?: string }>;
}

export default async function ChapterRosterPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const { payload } = await resolveToken(token);

  const chapter = payload.chapter;
  if (!chapter) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>This link doesn't include a chapter. Please pick from the public site.</p>
      </main>
    );
  }

  const sb = getServerSupabase();
  // Visible members for this chapter
  const { data: rows } = await sb
    .from('chapter_member_visibility')
    .select(`
      member_id,
      public_business_name,
      members!inner(id,full_name:name,business_name:company)
    `)
    .eq('chapter', chapter)
    .eq('visible', true);

  const eventQs = sp.event ? `?event=${sp.event}` : '';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">BLOC {chapter} members</h1>
      <p className="mt-2 text-gray-600">A look at the room you'd be joining.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {(rows ?? []).map((r) => {
          const m = (r as unknown as { members: { id: string; full_name: string; business_name: string } }).members;
          const business = r.public_business_name ?? m.business_name;
          return (
            <li key={m.id} className="rounded border p-4">
              <div className="font-medium">{m.full_name}</div>
              <div className="text-sm text-gray-600">{business}</div>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/guest/i/${token}/details${eventQs}`}
        className="mt-8 inline-block rounded bg-black px-6 py-3 text-white"
      >
        I'd like to attend
      </Link>
    </main>
  );
}
