'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { useIntakeGuests } from '@/hooks/useIntakeGuests';
import type { IntakeConflictKind, IntakeRsvpStatus } from '@/types';

const CONFLICT_COLORS: Record<IntakeConflictKind, string> = {
  none: 'bg-green-50 text-green-700 border-green-200',
  exact: 'bg-red-50 text-red-700 border-red-200',
  related: 'bg-amber-50 text-amber-800 border-amber-200',
  other: 'bg-blue-50 text-blue-700 border-blue-200',
};

const STATUS_COLORS: Record<IntakeRsvpStatus, string> = {
  registered: 'bg-slate-100 text-slate-700',
  attended: 'bg-green-100 text-green-700',
  no_show: 'bg-orange-100 text-orange-700',
  canceled: 'bg-gray-100 text-gray-500',
};

export function IntakeGuestsTab() {
  const { rows, loading, error, refresh, setStatus, markSyncResolved } = useIntakeGuests();
  const [conflictFilter, setConflictFilter] = useState<IntakeConflictKind | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<IntakeRsvpStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [needsAttention, setNeedsAttention] = useState(false);
  const [sortBy, setSortBy] = useState<'submitted' | 'event'>('submitted');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = rows.filter((r) =>
      (conflictFilter === 'all' || r.conflict_kind === conflictFilter) &&
      (statusFilter === 'all' || r.status === statusFilter) &&
      (!needsAttention || r.conflict_kind === 'other' || r.has_unresolved_side_effects) &&
      (q === '' ||
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.business_name.toLowerCase().includes(q))
    );
    return [...result].sort((a, b) => {
      const av = sortBy === 'submitted' ? a.submitted_at : a.event_starts_at;
      const bv = sortBy === 'submitted' ? b.submitted_at : b.event_starts_at;
      return bv.localeCompare(av);
    });
  }, [rows, conflictFilter, statusFilter, search, needsAttention, sortBy]);

  async function onStatusChange(rsvpId: string, status: IntakeRsvpStatus) {
    setBusyRow(rsvpId);
    setActionError(null);
    try {
      await setStatus(rsvpId, status);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRow(null);
    }
  }

  async function onResolveSync(rsvpId: string) {
    setBusyRow(rsvpId);
    setActionError(null);
    try {
      await markSyncResolved(rsvpId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Guest Inbox</h2>
          <p className="text-sm text-gray-600">RSVPs from the public guest flow. {rows.length} total · {filtered.length} shown.</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex gap-3 text-sm flex-wrap items-center">
        <input
          type="search"
          placeholder="Search name, email, business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-1 min-w-[240px]"
          aria-label="Search guests"
        />
        <button
          type="button"
          onClick={() => setNeedsAttention((v) => !v)}
          aria-pressed={needsAttention}
          className={`rounded border px-3 py-1 ${needsAttention ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white hover:bg-gray-50'}`}
        >
          Needs attention
        </button>
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'submitted' | 'event')}
            className="rounded border px-2 py-1"
          >
            <option value="submitted">Submitted (newest)</option>
            <option value="event">Event date (soonest)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Conflict:</span>
          <select
            value={conflictFilter}
            onChange={(e) => setConflictFilter(e.target.value as IntakeConflictKind | 'all')}
            className="rounded border px-2 py-1"
          >
            <option value="all">All</option>
            <option value="none">None</option>
            <option value="exact">Exact</option>
            <option value="related">Related</option>
            <option value="other">Other / review</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IntakeRsvpStatus | 'all')}
            className="rounded border px-2 py-1"
          >
            <option value="all">All</option>
            <option value="registered">Registered</option>
            <option value="attended">Attended</option>
            <option value="no_show">No-show</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>
      </div>

      {actionError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          Action failed: {actionError}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-sm text-gray-500">Loading guests…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
          No guests match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Event · Chapter</th>
                <th className="px-3 py-2">Invited by</th>
                <th className="px-3 py-2">Conflict</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.rsvp_id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.first_name} {r.last_name}</div>
                    <a
                      href={`mailto:${r.email}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {r.email}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.business_name}</div>
                    {r.other_category_text && (
                      <div className="text-xs text-blue-600">&ldquo;{r.other_category_text}&rdquo;</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.event_title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(r.event_starts_at).toLocaleDateString()} · {r.chapter ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.invited_by_member_name ?? <span className="text-gray-400">QR / self</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${CONFLICT_COLORS[r.conflict_kind]}`}>
                      {r.conflict_kind}
                    </span>
                    {r.conflict_member_name && (
                      <div className="text-xs text-gray-500 mt-1">vs {r.conflict_member_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      disabled={busyRow === r.rsvp_id}
                      onChange={(e) => onStatusChange(r.rsvp_id, e.target.value as IntakeRsvpStatus)}
                      className={`rounded border px-1.5 py-0.5 text-xs ${STATUS_COLORS[r.status]} disabled:opacity-50`}
                      aria-label={`Status for ${r.first_name} ${r.last_name}`}
                    >
                      <option value="registered">registered</option>
                      <option value="attended">attended</option>
                      <option value="no_show">no_show</option>
                      <option value="canceled">canceled</option>
                    </select>
                    {r.has_unresolved_side_effects && (
                      <button
                        type="button"
                        disabled={busyRow === r.rsvp_id}
                        onClick={() => onResolveSync(r.rsvp_id)}
                        title="Mark sync failure resolved"
                        aria-label="Mark sync failure resolved"
                        className="ml-2 inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <AlertTriangle size={12} />
                        <Check size={12} />
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(r.submitted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
