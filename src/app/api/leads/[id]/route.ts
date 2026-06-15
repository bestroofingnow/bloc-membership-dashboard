import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCaller } from '@/lib/growth/caller';

export const runtime = 'nodejs';

const patchSchema = z.object({
  next_action: z.string().max(500).nullable().optional(),
  next_action_due: z.string().datetime().nullable().optional(),
});

interface Props { params: Promise<{ id: string }> }

/**
 * Update a lead's follow-up fields (next action + due date). Allowed for staff
 * (any lead) or the member who invited that lead (their own guest) — so the
 * whole team can work their leads without exposing anyone else's.
 */
export async function PATCH(req: Request, { params }: Props) {
  const { id } = await params;
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const caller = await resolveCaller(token);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: lead, error: leadErr } = await caller.sb
    .from('leads')
    .select('id,invited_by_member_id')
    .eq('id', id)
    .maybeSingle();
  if (leadErr || !lead) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isOwner = !!caller.memberId && lead.invited_by_member_id === caller.memberId;
  if (!caller.isStaff && !isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.next_action !== undefined) update.next_action = parsed.data.next_action;
  if (parsed.data.next_action_due !== undefined) update.next_action_due = parsed.data.next_action_due;

  const { error: upErr } = await caller.sb.from('leads').update(update).eq('id', id);
  if (upErr) {
    console.error('lead patch', upErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
