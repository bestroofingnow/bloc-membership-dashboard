'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Wand2, RotateCcw, Filter } from 'lucide-react';
import { useMemberTaxonomyAdmin } from '@/hooks/useMemberTaxonomyAdmin';
import type { MemberTaxonomyRow } from '@/types';

type Filter = 'all' | 'unassigned' | 'with_suggestion';

export function MemberTaxonomyTab() {
  const { rows, industries, categories, loading, error, stats, refresh, setMemberTaxonomy } = useMemberTaxonomyAdmin();
  const [filter, setFilter] = useState<Filter>('unassigned');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'unassigned' && r.current_industry_id) return false;
      if (filter === 'with_suggestion' && (r.current_industry_id || !r.suggested_industry_id)) return false;
      if (q) {
        const text = `${r.name} ${r.company} ${r.legacy_industry_text ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  async function applySuggestion(r: MemberTaxonomyRow) {
    if (!r.suggested_industry_id && !r.suggested_category_id) return;
    setBusyId(r.member_id);
    setActionError(null);
    try {
      await setMemberTaxonomy(r.member_id, r.suggested_industry_id, r.suggested_category_id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function clearAssignment(r: MemberTaxonomyRow) {
    if (!confirm(`Clear taxonomy on ${r.name}? They’ll fall out of conflict-engine consideration until reassigned.`)) return;
    setBusyId(r.member_id);
    setActionError(null);
    try {
      await setMemberTaxonomy(r.member_id, null, null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function setExplicit(r: MemberTaxonomyRow, industry_id: string | null, category_id: string | null) {
    setBusyId(r.member_id);
    setActionError(null);
    try {
      // If category was picked, derive its parent industry; nicer than refusing.
      let resolvedIndustry = industry_id;
      if (category_id) {
        const cat = categories.find((c) => c.id === category_id);
        if (cat) resolvedIndustry = cat.category_id;
      }
      await setMemberTaxonomy(r.member_id, resolvedIndustry, category_id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function applyAllSuggestions() {
    const candidates = rows.filter((r) => !r.current_industry_id && r.suggested_industry_id);
    if (candidates.length === 0) return;
    if (!confirm(`Apply ${candidates.length} suggestion${candidates.length === 1 ? '' : 's'} now? You can edit any of them afterward.`)) return;
    setBulkBusy(true);
    setBulkResult(null);
    let success = 0;
    let failed = 0;
    for (const r of candidates) {
      try {
        await setMemberTaxonomy(r.member_id, r.suggested_industry_id, r.suggested_category_id);
        success++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setBulkBusy(false);
    setBulkResult(`Applied ${success}${failed > 0 ? ` (${failed} failed)` : ''}.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles size={20} /> Member Taxonomy
          </h2>
          <p className="text-sm text-gray-600">
            Assign Industry → Category FKs to members so the conflict engine can spot category-seat conflicts when guests RSVP.
          </p>
        </div>
        <button onClick={refresh} disabled={loading} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Assigned" value={stats.assigned} tone="ok" />
        <Stat label="Unassigned" value={stats.unassigned} tone={stats.unassigned > 0 ? 'warn' : 'ok'} />
        <Stat label="Auto-suggestions" value={stats.suggestions} tone="info" />
      </div>

      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          <Filter size={14} />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded border px-2 py-1"
          >
            <option value="all">All members</option>
            <option value="unassigned">Unassigned only</option>
            <option value="with_suggestion">Unassigned with a suggestion</option>
          </select>
        </label>
        <input
          type="search"
          placeholder="Search name, business, industry text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-1 min-w-[260px]"
          aria-label="Search members"
        />
        {stats.suggestions > 0 && (
          <button
            type="button"
            disabled={bulkBusy}
            onClick={applyAllSuggestions}
            className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            <Wand2 size={14} />
            {bulkBusy ? 'Applying…' : `Apply all ${stats.suggestions} suggestions`}
          </button>
        )}
        {bulkResult && <span className="text-xs text-green-700">{bulkResult}</span>}
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {actionError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
          No members match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Legacy text</th>
                <th className="px-3 py-2">Current FK</th>
                <th className="px-3 py-2">Suggestion / Override</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const filteredCats = r.current_industry_id ? categories.filter((c) => c.category_id === r.current_industry_id) : categories;
                return (
                  <tr key={r.member_id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.company} · {r.chapter}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.legacy_industry_text ? <span className="text-gray-700">{r.legacy_industry_text}</span> : <span className="text-gray-400 italic">(none)</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.current_industry_id ? (
                        <div className="space-y-0.5">
                          <div className="text-sm">{r.current_industry_name}</div>
                          <div className="text-xs text-gray-500">{r.current_category_title ?? '— no category —'}</div>
                          <button
                            type="button"
                            disabled={busyId === r.member_id}
                            onClick={() => clearAssignment(r)}
                            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline disabled:opacity-50 mt-1"
                          >
                            <RotateCcw size={11} /> Clear
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">(unassigned)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!r.current_industry_id && r.suggested_industry_id && (
                        <button
                          type="button"
                          disabled={busyId === r.member_id}
                          onClick={() => applySuggestion(r)}
                          className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-800 hover:bg-blue-100 disabled:opacity-50 mb-2"
                        >
                          <Wand2 size={11} />
                          {r.suggested_category_title
                            ? `Apply: ${r.suggested_industry_name} → ${r.suggested_category_title}`
                            : `Apply: ${r.suggested_industry_name}`}
                        </button>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <select
                          value={r.current_industry_id ?? ''}
                          onChange={(e) => setExplicit(r, e.target.value || null, null)}
                          disabled={busyId === r.member_id}
                          className="rounded border px-1 py-0.5 text-xs max-w-[180px]"
                        >
                          <option value="">— Pick industry —</option>
                          {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                        <select
                          value={r.current_category_id ?? ''}
                          onChange={(e) => setExplicit(r, r.current_industry_id, e.target.value || null)}
                          disabled={busyId === r.member_id || !r.current_industry_id}
                          className="rounded border px-1 py-0.5 text-xs max-w-[200px] disabled:opacity-50"
                        >
                          <option value="">— Pick category —</option>
                          {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: number; tone?: 'ok' | 'warn' | 'info' }) {
  const tone = props.tone === 'ok' ? 'border-green-200 bg-green-50 text-green-800' :
    props.tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' :
    props.tone === 'info' ? 'border-blue-200 bg-blue-50 text-blue-800' :
    'border-gray-200 bg-white text-gray-700';
  return (
    <div className={`rounded border p-3 ${tone}`}>
      <div className="text-2xl font-semibold">{props.value}</div>
      <div className="text-xs uppercase tracking-wide opacity-80">{props.label}</div>
    </div>
  );
}
