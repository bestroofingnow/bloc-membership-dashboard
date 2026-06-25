import { createClient } from '@supabase/supabase-js';

export interface DirectoryMatch {
  name: string;
  company: string | null;
  chapter: string | null;
  industry: string | null;
  title: string | null;
  website: string | null;
  description: string | null;
}

// Business-only columns. We deliberately never select the opt-in personal fields
// (mobile_phone / address / birthday) — and not even business email/phone — so the
// assistant is a directory-lookup helper, not a contact-harvesting tool.
// `description` is the member's business summary (what they do), shown in the
// directory, so the assistant can speak fluently about each business.
const BUSINESS_COLUMNS = 'name, company, chapter, industry, title, website, description';

/**
 * A Supabase client scoped to the CALLER (anon key + the caller's JWT). Queries
 * run with the caller's RLS context, so member_directory's per-viewer privacy
 * projection applies exactly as it would for that member — never the all-powerful
 * service-role key.
 */
function callerClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase not configured');
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CHAPTERS = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

export async function searchMembers(
  token: string,
  args: { chapter?: string | null; query?: string | null; limit?: number },
): Promise<DirectoryMatch[]> {
  const sb = callerClient(token);
  let q = sb.from('member_directory').select(BUSINESS_COLUMNS);

  if (args.chapter === 'After Hours') {
    // The After Hours tier isn't a chapter — those members have a null chapter.
    q = q.eq('member_type', 'after_hours');
  } else if (args.chapter && CHAPTERS.includes(args.chapter)) {
    q = q.eq('chapter', args.chapter);
  }
  if (args.query) {
    // Strip characters that would break the PostgREST .or() grammar, then match
    // EACH word independently across the business fields. Chained .or() groups are
    // AND-ed, so "commercial real estate" matches a member whose description has
    // those words scattered — not only the exact phrase.
    const terms = args.query
      .replace(/[%,()]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .slice(0, 6);
    for (const term of terms) {
      q = q.or(
        `industry.ilike.%${term}%,company.ilike.%${term}%,title.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`,
      );
    }
  }
  q = q.order('name', { ascending: true }).limit(Math.min(Math.max(args.limit ?? 50, 1), 100));

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as DirectoryMatch[];
}

/**
 * Look up specific members by (partial) name, returning the full business profile
 * — including the description of what their business does. For "tell me about
 * <name>" / "what does <name>'s company do" questions.
 */
export async function getMember(
  token: string,
  name: string | null | undefined,
): Promise<DirectoryMatch[]> {
  const term = (name ?? '').replace(/[%,()]/g, ' ').trim();
  if (!term) return [];
  const sb = callerClient(token);
  const { data, error } = await sb
    .from('member_directory')
    .select(BUSINESS_COLUMNS)
    .ilike('name', `%${term}%`)
    .order('name', { ascending: true })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as DirectoryMatch[];
}

export async function directoryStats(
  token: string,
): Promise<{ total: number; without_industry: number; by_chapter: Record<string, number> }> {
  const sb = callerClient(token);
  const { data, error } = await sb.from('member_directory').select('chapter, industry');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { chapter: string | null; industry: string | null }[];
  const by_chapter: Record<string, number> = {};
  let without_industry = 0;
  for (const r of rows) {
    const ch = r.chapter ?? 'After Hours';
    by_chapter[ch] = (by_chapter[ch] ?? 0) + 1;
    if (!r.industry || r.industry.trim() === '') without_industry++;
  }
  return { total: rows.length, without_industry, by_chapter };
}

/**
 * "Who is needed": the recruiting target categories (industry_targets) that are
 * NOT yet filled by a member — optionally within one chapter. Both source tables
 * are member-readable, so this runs caller-scoped like the rest.
 */
export async function recruitingNeeds(
  token: string,
  chapter?: string | null,
): Promise<{ chapter: string; open_targets: string[] }> {
  const sb = callerClient(token);

  const { data: targets, error: tErr } = await sb
    .from('industry_targets')
    .select('title, category_id');
  if (tErr) throw new Error(tErr.message);

  let dq = sb.from('member_directory').select('category_id, chapter');
  if (chapter && CHAPTERS.includes(chapter)) dq = dq.eq('chapter', chapter);
  const { data: dir, error: dErr } = await dq;
  if (dErr) throw new Error(dErr.message);

  const filled = new Set(
    ((dir ?? []) as { category_id: string | null }[])
      .map((d) => d.category_id)
      .filter((c): c is string => !!c),
  );

  const open_targets = ((targets ?? []) as { title: string | null; category_id: string | null }[])
    .filter((t) => !t.category_id || !filled.has(t.category_id))
    .map((t) => t.title)
    .filter((t): t is string => !!t);

  return { chapter: chapter && CHAPTERS.includes(chapter) ? chapter : 'all chapters', open_targets };
}
