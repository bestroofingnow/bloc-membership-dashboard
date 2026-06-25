import { resolveAssistantConfig } from '@/lib/assistant/config';

export type MembershipEmailKind = 'application' | 'acceptance' | 'unknown';

export interface ParsedMembershipEmail {
  kind: MembershipEmailKind;
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  chapter: string | null;
  /** 0..1 — how confident the model is in the classification + extraction. */
  confidence: number;
  summary: string;
}

const CHAPTERS = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

const SYSTEM_PROMPT = `You read notification emails from a membership system (Wild Apricot) for "Business Leaders of Charlotte" (BLOC) and extract structured data.

Classify the email's "kind":
- "application": a NEW membership application/sign-up was submitted, OR the person is now PENDING approval/awaiting review. Cues: "application submitted/received", "applied for membership", "pending approval", "awaiting review", "new applicant", status set to "Pending". The person is NOT yet an approved member.
- "acceptance": a membership was APPROVED/ACTIVATED/accepted — they are now an active member. Cues: "membership approved", "membership enabled/activated", "now active", "welcome to BLOC", status changed to "Active".
- "unknown": anything else (event RSVPs/registrations, receipts/invoices/payments, password resets, newsletters, generic admin notices). When unsure, use "unknown".

Extract the PROSPECT/MEMBER the email is about — the applicant, NOT BLOC staff, NOT the system sender, NOT the admin being notified:
- name, email, company, phone.
- chapter: one of North, South, Uptown, FLOC, Alumni, or null. Infer it from any chapter / membership-level / group name in the email — e.g. "BLOC-North" or "North" → North, "BLOC-Uptown" → Uptown, "FLOC" or "Future Leaders" → FLOC, "Alumni" → Alumni, "South" → South.

Return ONLY a JSON object with exactly these keys:
{"kind":"application|acceptance|unknown","name":"","email":"","company":"","phone":"","chapter":"","confidence":0.0,"summary":""}
Use "" (or null) for missing fields. "confidence" is 0..1. "summary" is one short sentence. Return ONLY the JSON.`;

/** Crude HTML→text fallback when an email only has an HTML body. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampChapter(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const hit = CHAPTERS.find((c) => c.toLowerCase() === v.trim().toLowerCase());
  return hit ?? null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 500) : null;
}

export interface ParseInput {
  from?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}

/**
 * Ask the configured LLM (Groq by default) to classify + extract a membership
 * email. Returns a 'unknown'/0-confidence result rather than throwing on any
 * failure, so the webhook always stores the row for human review.
 */
export async function parseMembershipEmail(input: ParseInput): Promise<ParsedMembershipEmail> {
  const fallback: ParsedMembershipEmail = {
    kind: 'unknown', name: null, email: null, company: null, phone: null,
    chapter: null, confidence: 0, summary: 'Could not parse automatically — review manually.',
  };

  const cfg = resolveAssistantConfig(process.env as Record<string, string | undefined>);
  if (!cfg.configured) return fallback;

  const body = (input.text && input.text.trim())
    ? input.text
    : input.html
      ? htmlToText(input.html)
      : '';
  const userMsg = [
    `FROM: ${(input.from ?? '').slice(0, 300)}`,
    `SUBJECT: ${(input.subject ?? '').slice(0, 500)}`,
    '',
    body.slice(0, 8000),
  ].join('\n');

  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!resp.ok) {
      console.error('parseMembershipEmail model error', resp.status, (await resp.text()).slice(0, 300));
      return fallback;
    }
    const j = await resp.json();
    const content: string = j.choices?.[0]?.message?.content ?? '';
    const jsonStr = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const kind: MembershipEmailKind =
      parsed.kind === 'application' || parsed.kind === 'acceptance' ? parsed.kind : 'unknown';
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      kind,
      name: str(parsed.name),
      email: str(parsed.email)?.toLowerCase() ?? null,
      company: str(parsed.company),
      phone: str(parsed.phone),
      chapter: clampChapter(parsed.chapter),
      confidence,
      summary: str(parsed.summary) ?? '',
    };
  } catch (e) {
    console.error('parseMembershipEmail failed', e);
    return fallback;
  }
}
