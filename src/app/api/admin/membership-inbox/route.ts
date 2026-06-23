import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const COLS =
  'id,kind,status,name,email,company,phone,chapter,from_address,subject,ai_confidence,ai_summary,lead_id,member_id,applied_at,created_at';

/**
 * Membership Inbox listing for directors/admins. Returns the most recent parsed
 * inbound emails (pending review + recently applied/dismissed) newest-first.
 * `?status=pending` narrows to the review queue.
 */
export async function GET(req: Request) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const status = new URL(req.url).searchParams.get('status');
  const sb = getServerSupabase();
  let q = sb.from('membership_inbox').select(COLS).order('created_at', { ascending: false }).limit(100);
  if (status === 'pending') q = q.eq('status', 'pending');

  const { data, error } = await q;
  if (error) {
    // Table not migrated yet — degrade gracefully so the UI shows an empty state.
    return NextResponse.json({ items: [], unavailable: true });
  }
  return NextResponse.json({ items: data ?? [] });
}
