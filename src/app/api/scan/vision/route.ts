import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/guest/rate-limit';

export const runtime = 'nodejs';

interface ExtractedCardData {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  linkedin: string;
  additionalNotes: string;
}

const EMPTY: ExtractedCardData = {
  name: '',
  title: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  linkedin: '',
  additionalNotes: '',
};

/**
 * Backup business-card extractor: when the mobile app's on-device OCR can't fully
 * read a card, it uploads the image here and we ask a vision model (Groq /
 * Llama 4 Scout by default) to pull the structured fields. Key stays server-side.
 * Returns { success, data } — no persistence; the client reviews + saves via
 * /api/scan/export.
 */
export async function POST(request: Request) {
  const apiKey = (process.env.ASSISTANT_API_KEY || process.env.GROQ_API_KEY || '').trim();
  const baseUrl = (process.env.ASSISTANT_BASE_URL || 'https://api.groq.com/openai/v1')
    .trim()
    .replace(/\/+$/, '');
  const model = (
    process.env.SCAN_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
  ).trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Vision model is not configured (set GROQ_API_KEY).' },
      { status: 503 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Require a logged-in member before the paid vision call.
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await authClient.auth.getUser(bearer);
  const uid = authData?.user?.id ?? null;
  if (authErr || !uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await rateLimit({ bucket: `scanvision:${uid}`, limit: 20, windowSeconds: 60 });
  if (!ok) {
    return NextResponse.json({ error: 'Too many scans. Please wait a minute.' }, { status: 429 });
  }

  let dataUrl: string;
  try {
    const form = await request.formData();
    const file = form.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!valid.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 });
    }
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    dataUrl = `data:${file.type};base64,${b64}`;
  } catch {
    return NextResponse.json({ error: 'Failed to process uploaded image' }, { status: 400 });
  }

  const prompt = `Read this business card image and extract the contact details. Return ONLY a valid JSON object with exactly these keys (use "" when a field is absent):
{"name":"","title":"","company":"","email":"","phone":"","address":"","website":"","linkedin":"","additionalNotes":""}
Return ONLY the JSON object, no commentary.`;

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error('vision model error', resp.status, t.slice(0, 300));
      return NextResponse.json({ error: `Vision model error (${resp.status})` }, { status: 502 });
    }

    const j = await resp.json();
    const content: string = j.choices?.[0]?.message?.content ?? '';
    const jsonStr = content
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();
    let parsed: Partial<ExtractedCardData> = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: 'Could not parse the vision result.' }, { status: 502 });
    }
    const data: ExtractedCardData = { ...EMPTY, ...parsed };
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('vision scan error', e);
    return NextResponse.json({ error: 'Vision scan failed.' }, { status: 500 });
  }
}
