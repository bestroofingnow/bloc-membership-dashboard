import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const upsertSchema = z.object({
  member_id: z.string().uuid(),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  visible: z.boolean(),
  public_business_name: z.string().max(200).nullable().optional(),
  public_category_id: z.string().uuid().nullable().optional(),
});

function checkChapterScope(profileRole: string, profileChapter: string | null, target: string): boolean {
  return profileRole === 'admin' || profileChapter === target;
}

export async function POST(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  if (!checkChapterScope(profile.role, profile.chapter, p.chapter)) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const sb = getServerSupabase();
  const { error: upErr } = await sb
    .from('chapter_member_visibility')
    .upsert({
      member_id: p.member_id,
      chapter: p.chapter,
      visible: p.visible,
      public_business_name: p.public_business_name ?? null,
      public_category_id: p.public_category_id ?? null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'member_id,chapter' });
  if (upErr) {
    console.error('chapter_member_visibility upsert', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const member_id = url.searchParams.get('member_id');
  const chapter = url.searchParams.get('chapter');
  if (!member_id || !chapter) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!checkChapterScope(profile.role, profile.chapter, chapter)) {
    return NextResponse.json({ error: 'forbidden_chapter' }, { status: 403 });
  }

  const sb = getServerSupabase();
  const { error: delErr } = await sb
    .from('chapter_member_visibility')
    .delete()
    .eq('member_id', member_id)
    .eq('chapter', chapter);
  if (delErr) {
    console.error('chapter_member_visibility delete', delErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
