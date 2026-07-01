import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/guest/rate-limit';
import { upsertWaitingLead, promoteToMember, type MembershipPerson } from '@/lib/membership/apply';

export const runtime = 'nodejs';

const schema = z.object({
  action: z.enum(['add_waiting', 'approve_member', 'dismiss']),
  // Optional corrected fields, in case the AI mis-extracted something.
  person: z
    .object({
      name: z.string().max(200).nullable().optional(),
      email: z.string().max(320).nullable().optional(),
      company: z.string().max(200).nullable().optional(),
      phone: z.string().max(50).nullable().optional(),
      chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']).nullable().optional(),
    })
    .optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Act on a Membership Inbox item (director/admin). `add_waiting` files the person
 * as a waiting lead (stage 'applied'); `approve_member` upserts the members row +
 * advances the lead to 'member'; `dismiss` archives the item. An optional `person`
 * lets the director correct AI-extracted fields before applying.
 */
export async function POST(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await rateLimit({ bucket: `membership-inbox:${profile.id}`, limit: 40, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const { action, person: override } = parsed.data;

  const sb = getServerSupabase();
  const { data: row, error: loadErr } = await sb
    .from('membership_inbox')
    .select('id,status,name,email,company,phone,chapter')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (action === 'dismiss') {
    await sb.from('membership_inbox').update({ status: 'dismissed' }).eq('id', id);
    return NextResponse.json({ ok: true, status: 'dismissed' });
  }

  const person: MembershipPerson = {
    name: override?.name ?? row.name,
    email: override?.email ?? row.email,
    company: override?.company ?? row.company,
    phone: override?.phone ?? row.phone,
    chapter: override?.chapter ?? row.chapter,
  };

  try {
    if (action === 'approve_member') {
      const { memberId, leadId } = await promoteToMember(sb, id, person);
      await sb
        .from('membership_inbox')
        .update({
          status: 'applied',
          member_id: memberId,
          lead_id: leadId,
          applied_by: profile.id,
          applied_at: new Date().toISOString(),
          // persist any director corrections
          name: person.name ?? null, email: person.email ?? null,
          company: person.company ?? null, phone: person.phone ?? null, chapter: person.chapter ?? null,
        })
        .eq('id', id);
      return NextResponse.json({ ok: true, status: 'applied', memberId, leadId });
    }

    // add_waiting
    const leadId = await upsertWaitingLead(sb, id, person);
    await sb
      .from('membership_inbox')
      .update({
        status: 'applied',
        lead_id: leadId,
        applied_by: profile.id,
        applied_at: new Date().toISOString(),
        name: person.name ?? null, email: person.email ?? null,
        company: person.company ?? null, phone: person.phone ?? null, chapter: person.chapter ?? null,
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, status: 'applied', leadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('membership_inbox').update({ status: 'error', error: msg.slice(0, 500) }).eq('id', id);
    return NextResponse.json({ error: 'apply_failed', detail: msg }, { status: 500 });
  }
}
