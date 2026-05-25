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
  // Visible members for this chapter, with their own + override category for display
  const { data: rows } = await sb
    .from('chapter_member_visibility')
    .select(`
      member_id,
      public_business_name,
      public_category_id,
      members!inner(id,full_name:name,business_name:company,category_id)
    `)
    .eq('chapter', chapter)
    .eq('visible', true);

  // Look up category names in one batch (member.category_id ∪ public_category_id)
  const memberRows = (rows ?? []) as unknown as Array<{
    member_id: string;
    public_business_name: string | null;
    public_category_id: string | null;
    members: { id: string; full_name: string; business_name: string; category_id: string | null };
  }>;
  const categoryIds = Array.from(new Set(
    memberRows.flatMap((r) => [r.public_category_id, r.members.category_id]).filter(Boolean) as string[]
  ));
  const categoryNames = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await sb
      .from('industry_targets')
      .select('id,title')
      .in('id', categoryIds);
    for (const c of cats ?? []) categoryNames.set(c.id, c.title);
  }

  const eventQs = sp.event ? `?event=${sp.event}` : '';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">BLOC {chapter} members</h1>
      <p className="mt-2 text-gray-600">A look at the room you'd be joining.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {memberRows.map((r) => {
          const m = r.members;
          const business = r.public_business_name ?? m.business_name;
          const catId = r.public_category_id ?? m.category_id;
          const category = catId ? categoryNames.get(catId) : null;
          return (
            <li key={m.id} className="rounded border p-4">
              <div className="font-medium">{m.full_name}</div>
              <div className="text-sm text-gray-600">{business}</div>
              {category && <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">{category}</div>}
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
