// Supabase Edge Function: kb-embed
// The embedding engine for the Ask BLOC RAG knowledge base. Uses Supabase's built-in
// `gte-small` model (384-dim, free, no API key). Three modes (all require x-kb-secret):
//   - query:        { text }            -> { embedding }            (embed a search query)
//   - embed_member: { member_id }       -> upsert/delete that member's chunk
//   - sync_all:     {}                  -> reconcile every member chunk (seed / safety net)
// The members trigger (pg_net) calls embed_member on insert/update; ON DELETE CASCADE
// removes chunks for deleted members; sync_all also prunes inactive/removed members.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET = Deno.env.get('KB_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// deno-lint-ignore no-explicit-any
const session = new (globalThis as any).Supabase.ai.Session('gte-small');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function embed(text: string): Promise<number[]> {
  // mean_pool + normalize gives a single unit-length 384-vector suitable for cosine/inner-product.
  const out = await session.run(text, { mean_pool: true, normalize: true });
  return out as number[];
}

interface MemberRow {
  id: string;
  name: string | null;
  company: string | null;
  chapter: string | null;
  industry: string | null;
  title: string | null;
  description: string | null;
  ideal_referral: string | null;
  member_status: string | null;
}

/** Build the natural-language blurb we embed + show as a retrieved fact. */
function memberContent(m: MemberRow): string {
  const parts = [
    m.title ? `${m.name} — ${m.title}, ${m.company}` : `${m.name} — ${m.company}`,
    m.chapter ? `${m.chapter} chapter` : null,
    m.industry ? `Industry: ${m.industry}` : null,
    m.description ? m.description : null,
    m.ideal_referral ? `Ideal referral: ${m.ideal_referral}` : null,
  ].filter(Boolean);
  return parts.join('. ');
}

function isActive(m: MemberRow): boolean {
  return (m.member_status ?? 'active') === 'active';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // Auth: the DB trigger sends x-kb-secret; the Vercel assistant sends its service-role
  // key (already in its env) so no extra secret needs distributing.
  const okSecret = SECRET && req.headers.get('x-kb-secret') === SECRET;
  const okService = SERVICE_KEY && (req.headers.get('authorization') ?? '') === `Bearer ${SERVICE_KEY}`;
  if (!okSecret && !okService) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode ?? 'query';
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    if (mode === 'query') {
      const text = String(body?.text ?? '').slice(0, 2000);
      if (!text.trim()) return json({ error: 'empty_text' }, 400);
      return json({ embedding: await embed(text) });
    }

    if (mode === 'search') {
      const text = String(body?.text ?? '').slice(0, 2000);
      if (!text.trim()) return json({ error: 'empty_text' }, 400);
      const embedding = await embed(text);
      const { data, error } = await sb.rpc('match_knowledge', {
        query_embedding: JSON.stringify(embedding),
        match_count: Math.min(Number(body?.match_count ?? 6), 12),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ matches: data ?? [] });
    }

    if (mode === 'embed_member') {
      const id = String(body?.member_id ?? '');
      if (!id) return json({ error: 'missing_member_id' }, 400);
      const { data: m } = await sb
        .from('members')
        .select('id,name,company,chapter,industry,title,description,ideal_referral,member_status')
        .eq('id', id)
        .maybeSingle();
      // Gone or inactive → ensure no stale chunk remains.
      if (!m || !isActive(m as MemberRow)) {
        await sb.from('knowledge_chunks').delete().eq('member_id', id);
        return json({ ok: true, removed: true });
      }
      const content = memberContent(m as MemberRow);
      const embedding = await embed(content);
      // Replace (delete+insert): the member_id unique index is partial, so ON CONFLICT
      // can't target it; and pgvector wants the '[...]' text form, not a JSON number[].
      await sb.from('knowledge_chunks').delete().eq('member_id', id);
      const { error } = await sb.from('knowledge_chunks').insert({
        source_type: 'member',
        member_id: id,
        content,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, embedded: true });
    }

    if (mode === 'sync_all') {
      // Batched so we stay within the edge-function compute limit — call repeatedly
      // until { remaining: 0 }. Only embeds members that don't yet have a chunk.
      const BATCH = Number(body?.batch ?? 8);
      const { data: members } = await sb
        .from('members')
        .select('id,name,company,chapter,industry,title,description,ideal_referral,member_status');
      const active = (members ?? []).filter((m) => isActive(m as MemberRow));
      const { data: existing } = await sb
        .from('knowledge_chunks')
        .select('member_id')
        .eq('source_type', 'member');
      const have = new Set((existing ?? []).map((c) => c.member_id));
      const missing = active.filter((m) => !have.has(m.id));
      const todo = missing.slice(0, BATCH);
      let firstErr: string | null = null;
      for (const m of todo) {
        const content = memberContent(m as MemberRow);
        const embedding = await embed(content);
        await sb.from('knowledge_chunks').delete().eq('member_id', m.id);
        const { error } = await sb.from('knowledge_chunks').insert({
          source_type: 'member',
          member_id: m.id,
          content,
          embedding: JSON.stringify(embedding),
          updated_at: new Date().toISOString(),
        });
        if (error && !firstErr) firstErr = error.message;
      }
      if (firstErr) return json({ error: firstErr }, 500);
      // Prune chunks whose member no longer qualifies (cheap; runs each call).
      const activeIds = new Set(active.map((m) => m.id));
      const stale = (existing ?? [])
        .filter((c) => c.member_id && !activeIds.has(c.member_id))
        .map((c) => c.member_id) as string[];
      if (stale.length) await sb.from('knowledge_chunks').delete().in('member_id', stale);
      return json({ ok: true, embedded: todo.length, remaining: missing.length - todo.length });
    }

    return json({ error: 'unknown_mode' }, 400);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
