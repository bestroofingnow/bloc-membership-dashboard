import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { linkLead } from '@/lib/leads/linkLead';
import { parseJoinInput } from '@/lib/join/validate';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

export async function POST(request: Request) {
  // Durable per-IP rate limit — an in-memory map doesn't survive serverless
  // instances, so use the shared DB-backed limiter like every other route.
  const ip = ipFromHeaders(request.headers);
  const allowed = await rateLimit({ bucket: `join:${ip}`, limit: 3, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Validate + normalize the simplified sign-up (name, business name, email/phone).
  const parsed = parseJoinInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, company, email, phone } = parsed.value;

  const { data: inserted, error } = await supabase
    .from('public_signups')
    .insert([
      {
        name,
        company,
        email,
        phone,
        industry: null,
        referral_source: null,
        notes: null,
      },
    ])
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('Failed to insert signup:', error);
    return NextResponse.json(
      { error: 'Failed to submit. Please try again.' },
      { status: 500 }
    );
  }

  // Attribution: if the form was reached via a member's invite link
  // (…/join?ref=<memberId>), credit the application to that member.
  let invitedByMemberId: string | null = null;
  const ref = typeof body.ref === 'string' ? body.ref.trim() : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
    const { data: refMember } = await supabase.from('members').select('id').eq('id', ref).maybeSingle();
    invitedByMemberId = refMember?.id ?? null;
  }

  // Non-blocking: link into the one lead funnel. Lead-only (never 'member') — invite-only.
  await linkLead(supabase, {
    source_table: 'public_signups',
    source_id: inserted.id,
    email,
    name,
    company,
    phone,
    source: 'public_signup',
    stage: 'applied',
    invited_by_member_id: invitedByMemberId,
    note: invitedByMemberId ? 'web join form (member invite)' : 'web join form',
  });

  return NextResponse.json({ success: true });
}
