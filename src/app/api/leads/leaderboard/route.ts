import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/growth/caller';

export const runtime = 'nodejs';

interface Row { member_id: string; member_name: string; invited: number; converted: number }

/**
 * Recruiting leaderboard: invited + converted counts per inviting member.
 * Visible to all logged-in members (motivational, business-name only — no PII).
 * Aggregated server-side via the service role from the staff-only leads table.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const caller = await resolveCaller(token);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { data: leads, error } = await caller.sb
      .from('leads')
      .select('invited_by_member_id,converted_member_id,stage')
      .not('invited_by_member_id', 'is', null);
    if (error) return NextResponse.json({ rows: [], meMemberId: caller.memberId, unavailable: true });

    const tally = new Map<string, { invited: number; converted: number }>();
    for (const l of (leads ?? []) as { invited_by_member_id: string; converted_member_id: string | null; stage: string }[]) {
      const t = tally.get(l.invited_by_member_id) ?? { invited: 0, converted: 0 };
      t.invited += 1;
      if (l.converted_member_id || l.stage === 'member') t.converted += 1;
      tally.set(l.invited_by_member_id, t);
    }

    const ids = [...tally.keys()];
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: mems } = await caller.sb.from('members').select('id,name').in('id', ids);
      for (const m of (mems ?? []) as { id: string; name: string }[]) nameById.set(m.id, m.name);
    }

    const rows: Row[] = ids
      .map((id) => ({ member_id: id, member_name: nameById.get(id) ?? 'Unknown member', invited: tally.get(id)!.invited, converted: tally.get(id)!.converted }))
      .sort((a, b) => b.converted - a.converted || b.invited - a.invited)
      .slice(0, 25);

    return NextResponse.json({ rows, meMemberId: caller.memberId });
  } catch {
    return NextResponse.json({ rows: [], meMemberId: caller.memberId, unavailable: true });
  }
}
