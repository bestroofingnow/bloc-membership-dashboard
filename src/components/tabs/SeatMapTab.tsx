'use client';

import { useEffect, useMemo, useState } from 'react';
import { Grid3x3, Download, AlertTriangle } from 'lucide-react';
import { useSeatMap } from '@/hooks/useSeatMap';
import { useAuth } from '@/contexts/AuthContext';
import type { ChapterName } from '@/types';

const CHAPTERS: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

type Filter = 'all' | 'open' | 'occupied' | 'multi';

const STATUS_BADGE = {
  open: 'bg-green-50 text-green-700 border-green-200',
  occupied: 'bg-blue-50 text-blue-700 border-blue-200',
  multi: 'bg-amber-50 text-amber-800 border-amber-200',
} as const;

export function SeatMapTab() {
  const { isAdmin, profile } = useAuth();
  const directorChapter = profile?.chapter as ChapterName | undefined;
  const [chapter, setChapter] = useState<ChapterName>(directorChapter ?? 'Uptown');
  useEffect(() => {
    if (!isAdmin && directorChapter) setChapter(directorChapter);
  }, [isAdmin, directorChapter]);

  const { seats, stats, loading, error, refresh } = useSeatMap(chapter);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return seats.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (q) {
        const text = `${s.industry_name} ${s.category_title} ${s.occupants.map((o) => `${o.member_name} ${o.member_company}`).join(' ')}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [seats, filter, search]);

  function exportCsv() {
    const header = ['Industry', 'Category', 'Status', 'Holders'].join(',');
    const lines = filtered.map((s) => [
      csv(s.industry_name),
      csv(s.category_title),
      csv(s.status),
      csv(s.occupants.map((o) => `${o.member_name} (${o.member_company})`).join('; ')),
    ].join(','));
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bloc-seats-${chapter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Grid3x3 size={20} /> Category Seats
          </h2>
          <p className="text-sm text-gray-600">
            Which category seats are open vs occupied in <strong>{chapter}</strong>.
            Open seats are the recruitment targets.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={refresh} disabled={loading} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total seats" value={stats.total} />
        <Stat label="Open" value={stats.open} tone="ok" />
        <Stat label="Occupied" value={stats.occupied} tone="info" />
        <Stat label="Multi (cleanup)" value={stats.multi} tone={stats.multi > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="flex gap-3 flex-wrap items-center text-sm">
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Chapter:</span>
          <select
            value={chapter}
            onChange={(e) => setChapter(e.target.value as ChapterName)}
            disabled={!isAdmin}
            className="rounded border px-2 py-1"
          >
            {CHAPTERS.map((c) => <option key={c} value={c} disabled={!isAdmin && directorChapter !== c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Show:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded border px-2 py-1"
          >
            <option value="all">All seats</option>
            <option value="open">Open only</option>
            <option value="occupied">Occupied only</option>
            <option value="multi">Multi-occupied (needs cleanup)</option>
          </select>
        </label>
        <input
          type="search"
          placeholder="Search industry, category, holder…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-1 min-w-[260px]"
          aria-label="Search seats"
        />
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading && seats.length === 0 ? (
        <div className="text-sm text-gray-500">Loading seat map…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
          {seats.length === 0
            ? 'No category taxonomy yet — admins set up industries and categories via the Targets / Member Taxonomy tabs.'
            : 'No seats match the current filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Industry</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Holder(s)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={`${s.industry_id}::${s.category_id}`} className="border-t align-top">
                  <td className="px-3 py-2 text-gray-700">{s.industry_name}</td>
                  <td className="px-3 py-2 font-medium">{s.category_title}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${STATUS_BADGE[s.status]}`}>
                      {s.status === 'multi' && <AlertTriangle size={12} />}
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {s.occupants.length === 0 ? (
                      <span className="text-xs text-gray-400 italic">(no one — open seat)</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {s.occupants.map((o) => (
                          <li key={o.member_id} className="text-xs">
                            <span className="font-medium">{o.member_name}</span>
                            <span className="text-gray-500"> · {o.member_company}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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

function csv(value: string): string {
  // RFC 4180-ish: wrap in quotes if value contains comma, quote, or newline; escape quotes by doubling.
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
