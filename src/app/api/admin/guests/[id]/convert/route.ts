import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { requireDirector } from '@/lib/admin-auth';
import { convertGuestToMember, type MembershipPerson } from '@/lib/membership/apply';

export const runtime = 'nodejs';

const schema = z
  .object({
    // Optional corrections the director can supply at conversion time.
    name: z.string().max(200).nullable().optional(),
    email: z.string().max(320).nullable().optional(),
    company: z.string().max(200).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']).nullable().optional(),
  })
  .optional();

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Convert an Approved pipeline guest into a member (director/admin). Upserts the
 * members row (idempotent by email), advances the guest's lead to 'member', and
 * stamps the guest with converted_member_id so it drops off the prospect board.
 */
export async function POST(req: Request, { params }: Props) {
  const profile = await requireDirector(req);
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }
  const override = parsed.data ?? {};

  const sb = getServerSupabase();
  const { data: guest, error: loadErr } = await sb
    .from('guests')
    .select('id,name,company,email,phone,status,converted_member_id')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !guest) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Idempotent: if already converted, just return the existing member.
  if (guest.converted_member_id) {
    return NextResponse.json({ ok: true, memberId: guest.converted_member_id, alreadyConverted: true });
  }

  const person: MembershipPerson = {
    name: override.name ?? guest.name,
    email: override.email ?? guest.email,
    company: override.company ?? guest.company,
    phone: override.phone ?? guest.phone,
    chapter: override.chapter ?? null,
  };

  try {
    const { memberId, leadId } = await convertGuestToMember(sb, id, person);
    if (!memberId) {
      return NextResponse.json({ error: 'member_create_failed' }, { status: 500 });
    }
    await sb
      .from('guests')
      .update({ converted_member_id: memberId, converted_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ ok: true, memberId, leadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'convert_failed', detail: msg }, { status: 500 });
  }
}
