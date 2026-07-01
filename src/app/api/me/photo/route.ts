import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { rateLimit } from '@/lib/guest/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30; // bounds the Storage upload

/** True if the bytes start with a JPEG (FF D8 FF) or PNG (89 50 4E 47) signature. */
function looksLikeImage(b: Buffer): boolean {
  if (b.length < 4) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  return jpeg || png;
}

// ~2.7MB of base64 ≈ a ~2MB JPEG; the app resizes to ~512px first, so this is a ceiling.
const schema = z.object({ image_base64: z.string().min(32).max(3_500_000) });

/**
 * Member self-service: upload your OWN profile photo. Identified by matching auth
 * email → members.email. The JPEG is stored in the public `member-photos` bucket at
 * {member_id}.jpg (service role) and members.photo_url is set to its public URL with
 * a cache-busting version. Only that one member's row/photo is touched.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Throttle uploads (each is up to ~2MB into Storage).
  const ok = await rateLimit({ bucket: `photo:${userData.user.id}`, limit: 12, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'Too many uploads. Please wait a minute.' }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const raw = parsed.data.image_base64.replace(/^data:image\/\w+;base64,/, '');
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, 'base64');
  } catch {
    return NextResponse.json({ error: 'bad_image' }, { status: 400 });
  }
  if (bytes.length < 100 || !looksLikeImage(bytes)) {
    return NextResponse.json({ error: 'bad_image' }, { status: 400 });
  }

  const sb = getServerSupabase();
  const { data: memRow } = await sb
    .from('members')
    .select('id')
    .ilike('email', userData.user.email)
    .limit(1)
    .maybeSingle();
  if (!memRow) return NextResponse.json({ error: 'member_not_found_for_user' }, { status: 404 });

  const path = `${memRow.id}.jpg`;
  const { error: upErr } = await sb.storage
    .from('member-photos')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (upErr) {
    console.error('me photo upload', upErr);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  const { data: pub } = sb.storage.from('member-photos').getPublicUrl(path);
  const photoUrl = `${pub.publicUrl}?v=${Date.now()}`; // bust CDN/cache on re-upload
  const { error: setErr } = await sb.from('members').update({ photo_url: photoUrl }).eq('id', memRow.id);
  if (setErr) {
    console.error('me photo set url', setErr);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, photo_url: photoUrl });
}
