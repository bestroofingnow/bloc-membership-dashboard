'use client';

import { useState } from 'react';
import { Search, Bot } from 'lucide-react';
import { MembersTab } from './MembersTab';
import { AssistantTab } from './AssistantTab';

/**
 * The member "Directory" — browse the network or ask the AI assistant, in one
 * place. Consolidates the former Members + Ask BLOC tabs.
 */
export function DirectoryTab() {
  const [view, setView] = useState<'browse' | 'ask'>('browse');

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-bloc-blue text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Directory view">
        <button type="button" role="tab" aria-selected={view === 'browse'} onClick={() => setView('browse')} className={pill(view === 'browse')}>
          <Search size={15} /> Browse
        </button>
        <button type="button" role="tab" aria-selected={view === 'ask'} onClick={() => setView('ask')} className={pill(view === 'ask')}>
          <Bot size={15} /> Ask BLOC
        </button>
      </div>
      {view === 'browse' ? <MembersTab /> : <AssistantTab />}
    </div>
  );
}
