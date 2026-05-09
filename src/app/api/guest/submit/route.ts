import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ipFromHeaders, rateLimit } from '@/lib/guest/rate-limit';

const submitSchema = z.object({
  token: z.string(),
  session_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  business_name: z.string().min(1).max(200),
  chapter: z.enum(['North', 'South', 'Uptown', 'FLOC', 'Alumni']),
  event_id: z.string().uuid(),
  industry_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  other_category_text: z.string().max(200).nullable(),
  invited_by_member_id: z.string().uuid().nullable(),
  qr_token_id: z.string().uuid().nullable(),
}).refine(
  (d) => (d.industry_id && d.category_id) || (!!d.other_category_text),
  { message: 'Provide industry+category OR other_category_text' },
);

export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  const okMin = await rateLimit({ bucket: `submit:min:${ip}`, limit: 5, windowSeconds: 60 });
  const okHr = await rateLimit({ bucket: `submit:hr:${ip}`, limit: 20, windowSeconds: 3600 });
  if (!okMin || !okHr) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Step body — implementation continues in Task 4.3
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
