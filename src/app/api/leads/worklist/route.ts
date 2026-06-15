import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/growth/caller';

export const runtime = 'nodejs';

const BASE = 'id,name,company,stage,source,next_action,next_action_due,is_overdue,invited_by_member_id,invited_by_member_name,created_at';
const STAFF_EXTRA = ',email_normalized,phone';

/**
 * The follow-up worklist. Staff (admin/director) see ALL leads; a plain member
 * sees only the leads they invited (their "guests"). Always overdue-first.
 * Reads v_lead_pipeline server-side via the service role, scoped to the caller —
 * the leads tables are staff-only by RLS, so members can never read others'.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const caller = await resolveCaller(token);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // A plain member with no matched member record has no leads to show.
  if (!caller.isStaff && !caller.memberId) {
    return NextResponse.json({ role: caller.role, memberId: null, leads: [] });
  }

  try {
    let q = caller.sb
      .from('v_lead_pipeline')
      .select(caller.isStaff ? BASE + STAFF_EXTRA : BASE);
    if (!caller.isStaff) q = q.eq('invited_by_member_id', caller.memberId);

    q = q
      .order('is_overdue', { ascending: false })
      .order('next_action_due', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200);

    const { data, error } = await q;
    if (error) {
      // v_lead_pipeline missing (migrations not applied yet) — degrade gracefully.
      return NextResponse.json({ role: caller.role, memberId: caller.memberId, leads: [], unavailable: true });
    }
    return NextResponse.json({ role: caller.role, memberId: caller.memberId, leads: data ?? [] });
  } catch {
    return NextResponse.json({ role: caller.role, memberId: caller.memberId, leads: [], unavailable: true });
  }
}
