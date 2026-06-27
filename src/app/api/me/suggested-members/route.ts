import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { knowledgeSearch } from '@/lib/assistant/directory';

export const runtime = 'nodejs';

/**
 * "Members you should meet" — semantic referral-partner suggestions. Embeds the
 * caller's "ideal referral" (or business description) and returns the members whose
 * businesses best match it via the RAG vector index — i.e. people who likely reach
 * the caller's ideal customers. Excludes the caller. The client maps the member_ids
 * to names/photos and layers in "haven't met yet". Member identified by auth email.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = getServerSupabase();
  const { data: me } = await sb
    .from('members')
    .select('id, ideal_referral, description, industry')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });

  const basis = me.ideal_referral?.trim()
    ? 'ideal_referral'
    : me.description?.trim()
      ? 'description'
      : me.industry?.trim()
        ? 'industry'
        : 'none';
  const queryText =
    me.ideal_referral?.trim() || me.description?.trim() || me.industry?.trim() || '';
  if (!queryText) return NextResponse.json({ suggestions: [], basis });

  const matches = await knowledgeSearch(queryText, 12);
  const suggestions = matches
    .filter((m) => m.member_id && m.member_id !== me.id)
    .slice(0, 8)
    .map((m) => ({ member_id: m.member_id as string, similarity: m.similarity }));

  return NextResponse.json({ suggestions, basis });
}
