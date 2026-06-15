import { createClient } from '@supabase/supabase-js';

export interface DirectoryMatch {
  name: string;
  company: string | null;
  chapter: string | null;
  industry: string | null;
  title: string | null;
  website: string | null;
}

// Business-only columns. We deliberately never select the opt-in personal fields
// (mobile_phone / address / birthday) — and not even business email/phone — so the
// assistant is a directory-lookup helper, not a contact-harvesting tool.
const BUSINESS_COLUMNS = 'name, company, chapter, industry, title, website';

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

  if (args.chapter && CHAPTERS.includes(args.chapter)) {
    q = q.eq('chapter', args.chapter);
  }
  if (args.query) {
    // Strip characters that would break the PostgREST .or() filter grammar.
    const term = args.query.replace(/[%,()]/g, ' ').trim();
    if (term) {
      q = q.or(
        `industry.ilike.%${term}%,company.ilike.%${term}%,title.ilike.%${term}%,name.ilike.%${term}%`,
      );
    }
  }
  q = q.order('name', { ascending: true }).limit(Math.min(Math.max(args.limit ?? 50, 1), 100));

  const { data, error } = await q;
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
