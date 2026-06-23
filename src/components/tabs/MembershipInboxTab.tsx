'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, UserCheck, UserPlus, X, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui';

interface InboxItem {
  id: string;
  kind: 'application' | 'acceptance' | 'unknown';
  status: string;
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  chapter: string | null;
  subject: string | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  created_at: string;
}

type Action = 'add_waiting' | 'approve_member' | 'dismiss';

const KIND: Record<string, { label: string; cls: string }> = {
  application: { label: 'Application', cls: 'bg-blue-100 text-blue-800' },
  acceptance: { label: 'Acceptance', cls: 'bg-emerald-100 text-emerald-800' },
  unknown: { label: 'Needs review', cls: 'bg-slate-100 text-slate-700' },
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Membership Inbox — inbound applications/acceptances parsed by AI from the BLOC
 * online system's emails. Directors approve to add a waiting lead or promote to
 * member; the hybrid pipeline already auto-files confident applications.
 */
export function MembershipInboxTab() {
  const toast = useToast();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/membership-inbox?status=pending', { headers: await authHeaders() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setUnavailable(true);
        setItems([]);
      } else {
        setItems(body?.items ?? []);
        setUnavailable(!!body?.unavailable);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (item: InboxItem, action: Action) => {
      if (action === 'approve_member' && !window.confirm(`Approve ${item.name || 'this person'} as a member?`)) return;
      setBusyId(item.id);
      try {
        const res = await fetch(`/api/admin/membership-inbox/${item.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(body?.detail || body?.error || `Failed (${res.status})`);
        } else {
          toast.success(
            action === 'dismiss' ? 'Dismissed' : action === 'approve_member' ? 'Approved as member' : 'Added as waiting lead'
          );
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        }
      } catch {
        toast.error('Network error. Please try again.');
      } finally {
        setBusyId(null);
      }
    },
    [toast]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Inbox size={20} /> Membership Inbox
          </h2>
          <p className="text-sm text-gray-600">
            Applications and acceptances emailed from the BLOC online system, parsed automatically. Approve to
            add a waiting lead or promote to member.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {unavailable && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The membership inbox isn&apos;t available yet — run migration 031 so the table exists.
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No pending items. New applications and acceptances appear here automatically.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const k = KIND[item.kind] ?? KIND.unknown;
            const pct = item.ai_confidence != null ? Math.round(item.ai_confidence * 100) : null;
            const busy = busyId === item.id;
            const isAcceptance = item.kind === 'acceptance';
            return (
              <li key={item.id} className="rounded border bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${k.cls}`}>{k.label}</span>
                  {pct != null && <span className="text-xs text-slate-400">{pct}% confident</span>}
                </div>
                <div className="mt-1 font-medium">{item.name || '(no name)'}</div>
                {item.company && <div className="text-sm text-gray-600">{item.company}</div>}
                <div className="mt-1 text-sm text-gray-500">
                  {[item.email, item.phone, item.chapter ? `Chapter: ${item.chapter}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {item.ai_summary && <div className="mt-1 text-xs italic text-slate-400">{item.ai_summary}</div>}
                {item.subject && <div className="mt-0.5 truncate text-xs text-slate-400">Re: {item.subject}</div>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(item, 'approve_member')}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-white disabled:opacity-50 ${
                      isAcceptance ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <UserCheck size={14} /> Approve as member
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(item, 'add_waiting')}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
                      isAcceptance ? 'border hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <UserPlus size={14} /> Add as waiting lead
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(item, 'dismiss')}
                    className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={14} /> Dismiss
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
