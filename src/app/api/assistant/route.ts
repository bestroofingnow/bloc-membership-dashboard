import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/guest/rate-limit';
import { searchMembers, directoryStats, recruitingNeeds, getMember, knowledgeSearch } from '@/lib/assistant/directory';
import { resolveAssistantConfig, type AssistantConfig } from '@/lib/assistant/config';

export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = 4;
/** Statuses worth retrying (transient): rate-limit, gateway, and server errors. */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
/** Abort a single model call if it hangs, so we can retry/fall back instead of timing out the request. */
const MODEL_TIMEOUT_MS = 25_000;

interface ChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
  }>;
}

/**
 * Call the OpenAI-compatible chat-completions endpoint with resilience so a
 * momentary Groq hiccup doesn't surface as an error to the member: for each
 * model in [primary, ...fallbacks] (starting at `fromIdx`), retry transient
 * (429/5xx/network/timeout) failures a few times with backoff before degrading
 * to the next model. Returns the parsed completion + the index of the model that
 * answered (so the caller can stick with it for later tool rounds), or throws
 * after the whole chain is exhausted.
 */
async function chatCompletion(
  cfg: AssistantConfig,
  messages: Array<Record<string, unknown>>,
  fromIdx: number,
): Promise<{ data: ChatCompletion; modelIdx: number }> {
  const models = [cfg.model, ...cfg.fallbackModels];
  let lastErr = 'unknown error';
  for (let idx = Math.min(Math.max(fromIdx, 0), models.length - 1); idx < models.length; idx++) {
    const model = models[idx];
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
      try {
        const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 1024,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (resp.ok) return { data: (await resp.json()) as ChatCompletion, modelIdx: idx };
        lastErr = `${resp.status} ${(await resp.text()).slice(0, 200)}`;
        console.error('assistant: model error', model, lastErr);
        if (!TRANSIENT_STATUS.has(resp.status)) break; // non-transient → don't retry this model; try the next
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof Error ? e.message : String(e);
        console.error('assistant: fetch failed', model, lastErr);
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1))); // 250ms, 500ms backoff
    }
  }
  throw new Error(lastErr);
}

const SYSTEM_PROMPT = `You are the BLOC (Business Leaders of Charlotte) directory assistant, helping a logged-in member find other members and answer simple questions about the network.

HOW TO ANSWER:
- ALWAYS use the tools to get facts. NEVER invent, guess, or recall members from memory. If a tool returns no matches, say so plainly and suggest a broader search.
- You can only see BUSINESS information (name, company, chapter, industry, title, website, a short business description of what they do, and their stated "ideal referral" — the kind of customer or introduction they're looking for). Use the description to speak specifically about what a member's business does, and the ideal referral to answer "who is looking for ___" / "who wants ___ leads" (search_members matches that field too). You must NEVER provide or guess personal contact details (cell phone, home address, birthday, personal email); if asked, say those are private and the member should open that person's profile or reach out directly.
- There is no exact "profession" field. For a profession question (e.g. "a banker", "who does insurance"), call search_members with a relevant keyword (e.g. "bank", "insurance") — it also matches the business description. Some members have a sparse profile, so if results look thin, mention that.
- For a NEED or PROBLEM stated in plain language ("who can help me retire", "I need someone for my back pain", "looking to buy a house", "get in shape"), call knowledge_search with that need — it matches members by meaning even when keywords don't line up. Use search_members instead when the user names an explicit industry/keyword or a chapter.
- The five chapters are North, South, Uptown, FLOC, and Alumni, plus an "After Hours" wait-list tier.
- Use recruiting_needs to answer "who/what do we need" — the open recruiting target categories not yet filled.
- For a question about ONE specific person or their company ("tell me about Jane", "what does Jane's business do"), call get_member with their name and answer from the description.
- Be concise and friendly. List people as "Name — Company (Chapter)", adding a few words on what they do when it helps answer the question. When someone asks who can help with a need, briefly say WHY each match fits (from their business description). If a question is outside the member directory (and not friendly small talk about BLOC), say it's outside what you can help with.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_members',
      description: 'Search the BLOC member directory by chapter and/or a free-text keyword (matches industry, company, title, name). Use for "who is a banker in South" (query="bank", chapter="South") or "who does insurance".',
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'string', enum: ['North', 'South', 'Uptown', 'FLOC', 'Alumni', 'After Hours'], description: 'Limit to one chapter, or "After Hours" for the wait-list tier. Omit to search all.' },
          query: { type: 'string', description: 'Keyword(s) to match against industry/company/title/name and the business description, e.g. "bank", "insurance", "commercial real estate".' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'directory_stats',
      description: 'Counts of members per chapter and how many have no industry listed.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recruiting_needs',
      description: 'The open recruiting target categories not yet filled by a member ("who/what we need"), optionally for one chapter.',
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'string', enum: ['North', 'South', 'Uptown', 'FLOC', 'Alumni'], description: 'Limit to one chapter. Omit for all.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_search',
      description: "Semantic search across BLOC members by MEANING or NEED, not keywords. Use this for fuzzy, conceptual, or problem-based questions where a keyword search is weak — e.g. \"who can help me retire\", \"I need someone for my back pain\", \"who could help me buy a house\", \"I want to get in shape\". It finds members whose business fits the need even when the words don't match. Prefer search_members for an explicit industry/keyword or a chapter filter.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: "The member's need or situation in natural language, e.g. \"help lowering my taxes\" or \"planning for retirement\"." },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_member',
      description: 'Look up a specific member by name to get their full business profile — company, chapter, industry, title, website, and a description of what their business does. Use for "tell me about <name>" or "what does <name>/<their company> do".',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full or partial member name, e.g. "Amanda Hoffmann" or "Turner".' },
        },
        required: ['name'],
      },
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>, token: string): Promise<string> {
  try {
    if (name === 'search_members') {
      const rows = await searchMembers(token, {
        chapter: typeof input.chapter === 'string' ? input.chapter : null,
        query: typeof input.query === 'string' ? input.query : null,
      });
      return JSON.stringify({ count: rows.length, members: rows });
    }
    if (name === 'get_member') {
      const rows = await getMember(token, typeof input.name === 'string' ? input.name : null);
      return JSON.stringify({ count: rows.length, members: rows });
    }
    if (name === 'knowledge_search') {
      const matches = await knowledgeSearch(typeof input.query === 'string' ? input.query : '');
      return JSON.stringify({ count: matches.length, matches: matches.map((m) => m.content) });
    }
    if (name === 'directory_stats') return JSON.stringify(await directoryStats(token));
    if (name === 'recruiting_needs') {
      return JSON.stringify(await recruitingNeeds(token, typeof input.chapter === 'string' ? input.chapter : null));
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: `The directory could not be queried (${msg}). It may not be available yet.` });
  }
}

export async function POST(request: Request) {
  const cfg = resolveAssistantConfig(process.env as Record<string, string | undefined>);
  if (!cfg.configured) {
    return NextResponse.json(
      { error: 'The assistant is not set up yet. Add a free model key (e.g. GROQ_API_KEY) to enable it.' },
      { status: 503 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Require a logged-in member; keep the token to scope directory queries to them.
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ok = await rateLimit({ bucket: `assistant:${authData.user.id}`, limit: 20, windowSeconds: 60 });
  if (!ok) return NextResponse.json({ error: 'Too many questions. Please wait a minute.' }, { status: 429 });

  const body = await request.json().catch(() => null);
  const question = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!question) return NextResponse.json({ error: 'Empty question' }, { status: 400 });
  if (question.length > 1000) return NextResponse.json({ error: 'Question too long' }, { status: 400 });

  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter((m: unknown): m is { role: string; content: string } =>
      !!m && typeof (m as { content?: unknown }).content === 'string' &&
      ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant'))
    .slice(-10)
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  // OpenAI-compatible chat-completions messages (works with Groq gpt-oss / Llama,
  // OpenRouter, Together, local Ollama, …).
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: question },
  ];

  try {
    let modelIdx = 0; // stick with the first model that works across tool rounds
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { data, modelIdx: usedIdx } = await chatCompletion(cfg, messages, modelIdx);
      modelIdx = usedIdx;
      const msg = data.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls ?? [];

      if (toolCalls.length > 0) {
        messages.push(msg as unknown as Record<string, unknown>); // assistant turn that requested the tools
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
          const result = await runTool(tc.function.name, args, token);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
        continue;
      }

      const answer = (msg?.content ?? '').trim();
      return NextResponse.json({ answer: answer || "I couldn't find an answer to that." });
    }

    return NextResponse.json({ answer: 'That took too many steps — try asking a more specific question.' });
  } catch (e) {
    // Whole model chain (primary + fallbacks, each retried) failed — almost always a
    // transient Groq incident. Tell the member it's momentary, not broken.
    console.error('assistant route error', e);
    return NextResponse.json(
      { error: 'Ask BLOC is briefly unavailable — please try again in a moment.' },
      { status: 502 },
    );
  }
}
