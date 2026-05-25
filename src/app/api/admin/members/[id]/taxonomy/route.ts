import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

const patchSchema = z.object({
  industry_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
});

interface Props { params: Promise<{ id: string }> }

/**
 * Set industry_id + category_id on a member. Admin-only — changing taxonomy
 * affects how the conflict engine treats the member's category seat, which
 * is a global decision rather than a chapter-scoped one.
 */
export async function PATCH(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'admin_only' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const { industry_id, category_id } = parsed.data;

  const sb = getServerSupabase();

  // If category_id is set, ensure it belongs to industry_id (when both are set)
  if (category_id) {
    const { data: cat } = await sb
      .from('industry_targets')
      .select('category_id')
      .eq('id', category_id)
      .maybeSingle();
    if (!cat) return NextResponse.json({ error: 'category_not_found' }, { status: 404 });
    if (industry_id && (cat as { category_id: string }).category_id !== industry_id) {
      return NextResponse.json({ error: 'category_industry_mismatch' }, { status: 400 });
    }
  }

  const { error: upErr } = await sb
    .from('members')
    .update({ industry_id, category_id })
    .eq('id', id);
  if (upErr) {
    console.error('members taxonomy update', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
