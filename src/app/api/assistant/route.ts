import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/guest/rate-limit';
import { searchMembers, directoryStats } from '@/lib/assistant/directory';

export const runtime = 'nodejs';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT = `You are the BLOC (Business Leaders of Charlotte) directory assistant, helping a logged-in member find other members and answer simple questions about the network.

RULES:
- Answer ONLY from the results of the search_members / directory_stats tools. NEVER invent, guess, or recall members from memory. If a tool returns no matches, say so plainly and suggest a broader search.
- You can only see BUSINESS information (name, company, chapter, industry, title, website). You CANNOT see and must NEVER provide or guess personal contact details (cell phone, home address, birthday, personal email). If asked for those, explain they are private and suggest the member open that person's profile in the directory or reach out to them directly.
- There is no exact "profession" field. When a member asks about a profession (e.g. "a banker", "an attorney"), search with a relevant keyword (e.g. "bank", "law" or "attorney"). Some members have no industry listed, so if results look thin, mention that a few members may not have an industry on file.
- The five chapters are North, South, Uptown, FLOC, and Alumni. There is also an "After Hours" wait-list tier with no chapter.
- Be concise and friendly. When listing people, use "Name — Company (Chapter)" and a short note on why they matched.
- If a question is outside the member directory (and not basic friendly small talk about BLOC), politely say it's outside what you can help with right now.`;

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string; [k: string]: unknown };

const TOOLS = [
  {
    name: 'search_members',
    description:
      'Search the BLOC member directory for members by chapter and/or a free-text query (matches industry, company, title, or name). Use for questions like "who is a banker in North" (query="bank", chapter="North") or "which members do marketing".',
    input_schema: {
      type: 'object',
      properties: {
        chapter: { type: 'string', enum: ['North', 'South', 'Uptown', 'FLOC', 'Alumni'], description: 'Limit to one chapter. Omit to search all chapters.' },
        query: { type: 'string', description: 'Free-text keyword to match against industry/company/title/name, e.g. "bank", "attorney", "marketing".' },
      },
    },
  },
  {
    name: 'directory_stats',
    description: 'Counts of members per chapter and how many have no industry listed. Use for "how many members per chapter" or to caveat that some members have no industry on file.',
    input_schema: { type: 'object', properties: {} },
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
    if (name === 'directory_stats') {
      return JSON.stringify(await directoryStats(token));
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // member_directory missing (migrations not applied yet) or any query error:
    // hand a graceful note back to the model rather than throwing.
    return JSON.stringify({ error: `The member directory could not be queried (${msg}). It may not be available yet.` });
  }
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Assistant is not configured.' }, { status: 500 });
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

  // Conversation messages (Anthropic format). Start from prior turns + the new question.
  const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [
    ...history
      .filter((m: unknown): m is { role: string; content: string } =>
        !!m && typeof (m as { content?: unknown }).content === 'string' &&
        ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant'))
      .map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: question },
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('assistant: anthropic error', resp.status, errText);
        return NextResponse.json({ error: 'The assistant had trouble responding. Please try again.' }, { status: 502 });
      }

      const data = await resp.json();
      const content = (data.content ?? []) as AnthropicContentBlock[];
      const toolUses = content.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use');

      if (data.stop_reason === 'tool_use' && toolUses.length > 0) {
        // Record the assistant's tool-use turn, then answer each tool call.
        messages.push({ role: 'assistant', content });
        const toolResults = [];
        for (const tu of toolUses) {
          const result = await runTool(tu.name, tu.input ?? {}, token);
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
        }
        messages.push({ role: 'user', content: toolResults });
        continue; // let the model read the results and answer (or call again)
      }

      // Final answer: concatenate text blocks.
      const text = content
        .filter((b): b is AnthropicTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return NextResponse.json({ answer: text || "I couldn't find an answer to that." });
    }

    return NextResponse.json({ answer: 'That took too many steps — try asking a more specific question.' });
  } catch (e) {
    console.error('assistant route error', e);
    return NextResponse.json({ error: 'The assistant is unavailable right now. Please try again.' }, { status: 500 });
  }
}
