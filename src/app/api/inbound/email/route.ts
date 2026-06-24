import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';
import { rateLimit } from '@/lib/guest/rate-limit';
import { parseMembershipEmail } from '@/lib/membership/parseEmail';
import { upsertWaitingLead } from '@/lib/membership/apply';

export const runtime = 'nodejs';

/** Coerce the many shapes an email address field can take into a display string. */
function coerceAddress(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 300);
  if (Array.isArray(v)) return v.map(coerceAddress).filter(Boolean).join(', ').slice(0, 300) || null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const addr = (o.address || o.email || o.value) as string | undefined;
    const name = o.name as string | undefined;
    if (addr) return (name ? `${name} <${addr}>` : addr).slice(0, 300);
  }
  return null;
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v;
  return null;
}

interface FullInbound {
  from: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
}

/**
 * Resend's `email.received` webhook carries only metadata, so fetch the full
 * email body via the Received Emails API (GET /emails/receiving/{id}). Uses the
 * same RESEND_API_KEY as outbound. Returns null on any failure (caller falls back
 * to the metadata it already has).
 */
async function fetchResendInbound(id: string): Promise<FullInbound | null> {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      console.error('resend inbound fetch', r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const j = (await r.json()) as Record<string, unknown>;
    return {
      from: coerceAddress(j.from),
      subject: pickStr(j.subject),
      text: pickStr(j.text),
      html: pickStr(j.html),
    };
  } catch (e) {
    console.error('resend inbound fetch failed', e);
    return null;
  }
}

/**
 * Inbound email webhook for membership notifications from the BLOC online system
 * (Wild Apricot), delivered by Resend inbound (or any provider that POSTs JSON).
 * Auth is a shared secret in `?key=` or the `x-webhook-secret` header. An AI parse
 * classifies application vs acceptance and extracts the person; HYBRID model:
 * applications auto-create a waiting lead (stage 'applied'), acceptances are held
 * 'pending' for a director's one-tap approval. Always 200s after storing the row
 * so the provider doesn't retry-storm; nothing is auto-promoted to member here.
 */
export async function POST(request: Request) {
  const secret = (process.env.INBOUND_EMAIL_SECRET || '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'inbound email not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const provided = (url.searchParams.get('key') || request.headers.get('x-webhook-secret') || '').trim();
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ok = await rateLimit({ bucket: 'inbound-email', limit: 120, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Resend wraps the email in { type, data: {...} }; other providers POST it flat.
  const evt = ((body as Record<string, unknown>).data ?? body) as Record<string, unknown>;
  let from = coerceAddress(evt.from) ?? coerceAddress((evt as Record<string, unknown>).sender);
  let subject = pickStr(evt.subject, (evt as Record<string, unknown>).Subject) ?? '';
  let text = pickStr(evt.text, (evt as Record<string, unknown>).plain, (evt as Record<string, unknown>).body);
  let html = pickStr(evt.html, (evt as Record<string, unknown>).Html);

  // Resend inbound webhooks ship only metadata — pull the body via the API.
  const emailId = pickStr(evt.email_id, (evt as Record<string, unknown>).id);
  if (!text && !html && emailId) {
    const full = await fetchResendInbound(emailId);
    if (full) {
      from = full.from ?? from;
      subject = full.subject || subject;
      text = full.text;
      html = full.html;
    }
  }

  if (!text && !html && !subject) {
    return NextResponse.json({ error: 'empty_email' }, { status: 400 });
  }

  const parsed = await parseMembershipEmail({ from, subject, text, html });

  const sb = getServerSupabase();
  const { data: row, error: insErr } = await sb
    .from('membership_inbox')
    .insert([{
      kind: parsed.kind,
      status: 'pending',
      name: parsed.name,
      email: parsed.email,
      company: parsed.company,
      phone: parsed.phone,
      chapter: parsed.chapter,
      from_address: from,
      subject,
      raw_text: text ? text.slice(0, 20000) : null,
      raw_html: html ? html.slice(0, 50000) : null,
      ai_confidence: parsed.confidence,
      ai_summary: parsed.summary,
      parsed,
    }])
    .select('id')
    .single();

  if (insErr || !row) {
    console.error('inbound/email: insert failed', insErr?.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // HYBRID: a confident application with an email auto-becomes a waiting lead.
  let status = 'pending';
  let leadId: string | null = null;
  if (parsed.kind === 'application' && parsed.email && parsed.confidence >= 0.5) {
    leadId = await upsertWaitingLead(sb, row.id as string, parsed);
    status = 'applied';
    await sb
      .from('membership_inbox')
      .update({ status, lead_id: leadId, applied_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  return NextResponse.json({ ok: true, id: row.id, kind: parsed.kind, status });
}
