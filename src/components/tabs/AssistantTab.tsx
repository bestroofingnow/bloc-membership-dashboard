'use client';

import { useRef, useState } from 'react';
import { Bot, Send, Loader2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Showcase semantic search (the KB matches meaning, not just keywords) plus
// the classic roster questions. Keep in sync with the mobile Assistant examples.
const EXAMPLES = [
  'Who can help me buy a house?',
  'I need someone for my back pain',
  'Do we have a banker in North chapter?',
  'How many members are in each chapter?',
];

export function AssistantTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput('');
    const history = messages.slice(-10);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'The assistant could not answer that.');
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer as string }]);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bot size={20} className="text-bloc-blue" /> Ask BLOC
        </h2>
        <p className="text-sm text-gray-600">
          Ask about the member network — who does what, and in which chapter. It only sees members&apos;
          business info (never personal contact details) and only answers from the real directory.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="rounded-xl border border-slate-200 bg-white p-4 h-[52vh] overflow-y-auto space-y-4"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-slate-500">
            <Bot size={36} className="text-slate-300" />
            <p className="text-sm">Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => ask(ex)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                m.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-bloc-blue/10 text-bloc-blue'
              }`}
            >
              {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-bloc-blue text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-bloc-blue/10 text-bloc-blue flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="rounded-2xl px-4 py-2.5 bg-slate-100 text-slate-500 flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin" /> Looking through the directory…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the BLOC network…"
          aria-label="Ask the assistant a question"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-bloc-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bloc-lightBlue disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={16} /> Ask
        </button>
      </form>

      <p className="text-xs text-slate-400">
        Answers come from the live member directory and respect each member&apos;s privacy settings.
        The assistant can be wrong — double-check anything important.
      </p>
    </div>
  );
}
