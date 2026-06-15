import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/guest/rate-limit';
import { searchMembers, directoryStats, recruitingNeeds } from '@/lib/assistant/directory';
import { resolveAssistantConfig } from '@/lib/assistant/config';

export const runtime = 'nodejs';

const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT = `You are the BLOC (Business Leaders of Charlotte) directory assistant, helping a logged-in member find other members and answer simple questions about the network.

HOW TO ANSWER:
- ALWAYS use the tools to get facts. NEVER invent, guess, or recall members from memory. If a tool returns no matches, say so plainly and suggest a broader search.
- You can only see BUSINESS information (name, company, chapter, industry, title, website). You must NEVER provide or guess personal contact details (cell phone, home address, birthday, personal email); if asked, say those are private and the member should open that person's profile or reach out directly.
- There is no exact "profession" field. For a profession question (e.g. "a banker", "who does insurance"), call search_members with a relevant keyword (e.g. "bank", "insurance"). Some members have no industry on file, so if results look thin, mention that.
- The five chapters are North, South, Uptown, FLOC, and Alumni, plus an "After Hours" wait-list tier.
- Use recruiting_needs to answer "who/what do we need" — the open recruiting target categories not yet filled.
- Be concise and friendly. List people as "Name — Company (Chapter)". If a question is outside the member directory (and not friendly small talk about BLOC), say it's outside what you can help with.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_members',
      description: 'Search the BLOC member directory by chapter and/or a free-text keyword (matches industry, company, title, name). Use for "who is a banker in South" (query="bank", chapter="South") or "who does insurance".',
      parameters: {
        type: 'object',
        properties: {
          chapter: { type: 'string', enum: ['North', 'South', 'Uptown', 'FLOC', 'Alumni'], description: 'Limit to one chapter. Omit to search all.' },
          query: { type: 'string', description: 'Keyword to match against industry/company/title/name, e.g. "bank", "insurance".' },
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
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 1024,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('assistant: model error', resp.status, errText.slice(0, 500));
        return NextResponse.json({ error: 'The assistant had trouble responding. Please try again.' }, { status: 502 });
      }

      const data = await resp.json();
      const msg = data?.choices?.[0]?.message as
        | { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
        | undefined;
      const toolCalls = msg?.tool_calls ?? [];

      if (toolCalls.length > 0) {
        messages.push(msg as Record<string, unknown>); // assistant turn that requested the tools
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
    console.error('assistant route error', e);
    return NextResponse.json({ error: 'The assistant is unavailable right now. Please try again.' }, { status: 500 });
  }
}
