'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sprout, Copy, Check, QrCode, Trophy, AlertTriangle, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui';
import { QrImage } from '@/components/ui/QrImage';

interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  stage: string;
  source: string;
  next_action: string | null;
  next_action_due: string | null;
  is_overdue: boolean;
  invited_by_member_name: string | null;
  created_at: string;
}
interface LeaderRow { member_id: string; member_name: string; invited: number; converted: number }

const STAGE_LABEL: Record<string, string> = {
  new: 'New', rsvp: 'RSVP’d', attended: 'Attended', applied: 'Applied',
  approved: 'Approved', member: 'Member', declined: 'Declined',
};

function dueToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function LeadRow({ lead, isStaff, onSave }: { lead: Lead; isStaff: boolean; onSave: (id: string, action: string, due: string) => Promise<void> }) {
  const [action, setAction] = useState(lead.next_action ?? '');
  const [due, setDue] = useState(dueToDateInput(lead.next_action_due));
  const [saving, setSaving] = useState(false);
  const dirty = action !== (lead.next_action ?? '') || due !== dueToDateInput(lead.next_action_due);

  return (
    <div className={`rounded-lg border p-3 ${lead.is_overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{lead.name || '(no name)'}</div>
          {lead.company && <div className="text-sm text-slate-500 truncate">{lead.company}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {lead.is_overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
              <AlertTriangle size={11} /> Overdue
            </span>
          )}
          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-semibold">
            {STAGE_LABEL[lead.stage] ?? lead.stage}
          </span>
        </div>
      </div>
      {isStaff && lead.invited_by_member_name && (
        <div className="text-xs text-slate-400 mt-0.5">Invited by {lead.invited_by_member_name}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Next step (e.g. invite to After Hours)"
          aria-label={`Next step for ${lead.name ?? 'lead'}`}
          className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label={`Due date for ${lead.name ?? 'lead'}`}
          className="rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => { setSaving(true); await onSave(lead.id, action, due); setSaving(false); }}
          className="inline-flex items-center justify-center gap-1.5 rounded bg-bloc-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bloc-lightBlue disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Save
        </button>
      </div>
    </div>
  );
}

export function GrowTab() {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string>('member');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const t = sess.session?.access_token ?? null;
      setToken(t);
      const headers = t ? { Authorization: `Bearer ${t}` } : undefined;
      const [wRes, lRes] = await Promise.all([
        fetch('/api/leads/worklist', { headers }),
        fetch('/api/leads/leaderboard', { headers }),
      ]);
      const w = await wRes.json();
      const l = await lRes.json();
      if (wRes.ok) { setRole(w.role); setMemberId(w.memberId); setLeads(w.leads ?? []); setUnavailable(!!w.unavailable); }
      if (lRes.ok) setBoard(l.rows ?? []);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isStaff = role === 'admin' || role === 'chapter_director';
  const inviteUrl = memberId && typeof window !== 'undefined' ? `${window.location.origin}/join?ref=${memberId}` : '';

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy — long-press to select the link');
    }
  }

  async function saveLead(id: string, action: string, due: string) {
    const headers = { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        next_action: action.trim() || null,
        next_action_due: due ? new Date(`${due}T17:00:00`).toISOString() : null,
      }),
    });
    if (res.ok) { toast.success('Follow-up saved'); await load(); }
    else { const b = await res.json().catch(() => null); toast.error(`Save failed: ${b?.error ?? res.status}`); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><Sprout size={20} className="text-emerald-600" /> Grow BLOC</h2>
        <p className="text-sm text-gray-600">Invite prospects, work your follow-ups, and see who&apos;s growing the network.</p>
      </div>

      {unavailable && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The lead funnel isn&apos;t available yet — it lights up once the database migrations are applied.
        </div>
      )}

      {/* Your invite link */}
      {inviteUrl ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Your invite link</h3>
          <p className="text-xs text-gray-600">Share this with prospects. Anyone who applies through it is credited to you.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 break-all">{inviteUrl}</code>
            <div className="flex gap-2">
              <button type="button" onClick={copyInvite} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                {copied ? <><Check size={14} className="text-emerald-600" /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button type="button" onClick={() => setShowQr((v) => !v)} aria-pressed={showQr} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                <QrCode size={14} /> QR
              </button>
            </div>
          </div>
          {showQr && (
            <div className="flex justify-center pt-2"><QrImage url={inviteUrl} size={180} alt="Your BLOC invite QR code" /></div>
          )}
        </section>
      ) : (
        !loading && (
          <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            We couldn&apos;t match your login to a member record, so your personal invite link isn&apos;t available. Ask a director to confirm the email on your member profile.
          </section>
        )
      )}

      {/* Follow-up worklist */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wide text-gray-500">
            {isStaff ? 'Follow-up worklist — all leads' : 'My guests — follow up'}
          </h3>
          <span className="text-xs text-slate-400">{leads.length} {leads.length === 1 ? 'lead' : 'leads'}</span>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : leads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            {isStaff ? 'No leads yet.' : 'No one yet — share your invite link above to start growing the network.'}
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <LeadRow key={lead.id} lead={lead} isStaff={isStaff} onSave={saveLead} />
            ))}
          </div>
        )}
      </section>

      {/* Leaderboard */}
      {board.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><Trophy size={15} className="text-amber-500" /> Recruiting leaderboard</h3>
          <ul className="divide-y divide-slate-100">
            {board.map((r, i) => (
              <li key={r.member_id} className={`flex items-center justify-between py-2 ${r.member_id === memberId ? 'font-semibold text-bloc-navy' : ''}`}>
                <span className="flex items-center gap-2">
                  <span className="w-5 text-right text-slate-400 text-sm">{i + 1}</span>
                  {r.member_name}{r.member_id === memberId && <span className="text-xs text-bloc-blue">(you)</span>}
                </span>
                <span className="text-sm text-slate-500">
                  <strong className="text-emerald-600">{r.converted}</strong> joined · {r.invited} invited
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
