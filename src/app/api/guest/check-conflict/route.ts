import { NextResponse } from 'next/server';
import { z } from 'zod';
import { conflict } from '@/lib/guest/conflict';
import type { ChapterCode, MemberForConflict } from '@/lib/guest/types';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const querySchema = z.object({
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  industry_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const ok = await rateLimit({
    bucket: `check-conflict:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    chapter: url.searchParams.get('chapter'),
    industry_id: url.searchParams.get('industry_id') || null,
    category_id: url.searchParams.get('category_id') || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { chapter, industry_id, category_id } = parsed.data;
  const sb = getServerSupabase();
  const { data: members, error } = await sb
    .from('members')
    .select('id,chapter,industry_id,category_id,full_name,business_name')
    .eq('chapter', chapter);

  if (error) {
    console.error('check-conflict members fetch', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const result = conflict({
    chapter: chapter as ChapterCode,
    industry_id: industry_id ?? null,
    category_id: category_id ?? null,
    members_in_chapter: (members ?? []) as MemberForConflict[],
  });

  return NextResponse.json({
    kind: result.kind,
    occupant: result.occupants[0]
      ? {
          full_name: result.occupants[0].full_name,
          business_name: result.occupants[0].business_name,
        }
      : null,
  });
}
