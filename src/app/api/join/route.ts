import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { linkLead } from '@/lib/leads/linkLead';

// Simple in-memory rate limiting
const submissions = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_SUBMISSIONS = 3; // max 3 per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const lastSubmission = submissions.get(ip);
  if (!lastSubmission) {
    submissions.set(ip, now);
    return false;
  }
  if (now - lastSubmission < RATE_LIMIT_WINDOW) {
    return true;
  }
  submissions.set(ip, now);
  return false;
}

export async function POST(request: Request) {
  // Rate limit check
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
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

  // Validate required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  if (!body.company || typeof body.company !== 'string' || body.company.trim().length === 0) {
    return NextResponse.json(
      { error: 'Company is required' },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await supabase
    .from('public_signups')
    .insert([
      {
        name: body.name.trim(),
        company: body.company.trim(),
        industry: body.industry?.trim() || null,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        referral_source: body.referralSource?.trim() || null,
        notes: body.notes?.trim() || null,
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

  // Non-blocking: link into the one lead funnel. Lead-only (never 'member') — invite-only.
  await linkLead(supabase, {
    source_table: 'public_signups',
    source_id: inserted.id,
    email: body.email?.trim() || null,
    name: body.name.trim(),
    company: body.company.trim(),
    phone: body.phone?.trim() || null,
    source: 'public_signup',
    stage: 'applied',
    note: 'web join form',
  });

  return NextResponse.json({ success: true });
}
