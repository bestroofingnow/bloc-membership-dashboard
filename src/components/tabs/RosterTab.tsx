'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Users2, RotateCcw, Save, X } from 'lucide-react';
import { useChapterRoster } from '@/hooks/useChapterRoster';
import { useTargets } from '@/hooks/useTargets';
import { useAuth } from '@/contexts/AuthContext';
import type { ChapterName, RosterMember } from '@/types';

const CHAPTERS: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

export function RosterTab() {
  const { isAdmin, profile } = useAuth();
  const directorChapter = profile?.chapter as ChapterName | undefined;
  const [chapter, setChapter] = useState<ChapterName>(directorChapter ?? 'Uptown');
  useEffect(() => {
    if (!isAdmin && directorChapter) setChapter(directorChapter);
  }, [isAdmin, directorChapter]);

  const { roster, loading, error, upsertVisibility, clearOverride, refresh } = useChapterRoster(chapter);
  const targets = useTargets();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Flatten Targets into pickable categories
  const categoryOptions = useMemo(() => {
    const opts: { id: string; title: string }[] = [];
    const cats = targets.categories ?? [];
    for (const cat of cats) {
      for (const t of cat.targets ?? []) {
        opts.push({ id: t.id, title: `${cat.name} — ${t.title}` });
      }
    }
    return opts.sort((a, b) => a.title.localeCompare(b.title));
  }, [targets.categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) =>
      r.member_name.toLowerCase().includes(q) ||
      r.member_company.toLowerCase().includes(q) ||
      (r.public_business_name ?? '').toLowerCase().includes(q)
    );
  }, [roster, search]);

  const visibleCount = roster.filter((r) => r.visible).length;

  async function toggleVisible(m: RosterMember, next: boolean) {
    setBusy(m.member_id);
    try {
      await upsertVisibility({
        member_id: m.member_id,
        chapter,
        visible: next,
        public_business_name: m.public_business_name,
        public_category_id: m.public_category_id,
      });
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function reset(m: RosterMember) {
    if (!m.has_override_row) return;
    if (!confirm(`Reset ${m.member_name} to default (visible, no overrides)?`)) return;
    setBusy(m.member_id);
    try {
      await clearOverride(m.member_id, chapter);
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users2 size={20} /> Roster Manager
          </h2>
          <p className="text-sm text-gray-600">
            Control which members appear on the public chapter roster preview, and customize how they show.
          </p>
        </div>
        <button onClick={refresh} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Refresh</button>
      </div>

      <div className="flex gap-3 text-sm flex-wrap items-center">
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
        <input
          type="search"
          placeholder="Search name, business…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-1 min-w-[240px]"
          aria-label="Search roster"
        />
        <span className="text-gray-600">{visibleCount} of {roster.length} visible publicly</span>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading && roster.length === 0 ? (
        <div className="text-sm text-gray-500">Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
          No members found for this chapter.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            const isEditing = editingId === m.member_id;
            return (
              <li key={m.member_id} className={`rounded border p-3 bg-white ${m.visible ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{m.member_name}</span>
                      {!m.visible && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs">hidden</span>}
                      {m.has_override_row && (m.public_business_name || m.public_category_id) && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">override</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      <span>{m.public_business_name ?? m.member_company}</span>
                      {m.public_business_name && (
                        <span className="text-xs text-gray-400 ml-1">(override of: {m.member_company})</span>
                      )}
                    </div>
                    {(m.public_category_title || m.member_category_title) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Category: {m.public_category_title ?? m.member_category_title}
                        {m.public_category_title && m.member_category_title && (
                          <span className="text-gray-400 ml-1">(override of: {m.member_category_title})</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      title={m.visible ? 'Hide from public roster' : 'Show on public roster'}
                      aria-label={m.visible ? 'Hide from public roster' : 'Show on public roster'}
                      disabled={busy === m.member_id}
                      onClick={() => toggleVisible(m, !m.visible)}
                      className={`rounded border p-1.5 hover:bg-gray-50 disabled:opacity-50 ${m.visible ? 'text-green-700 border-green-200' : 'text-gray-500'}`}
                    >
                      {m.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      title="Edit overrides"
                      aria-label="Edit overrides"
                      onClick={() => setEditingId(isEditing ? null : m.member_id)}
                      className="rounded border p-1.5 hover:bg-gray-50"
                    >
                      <Save size={14} />
                    </button>
                    {m.has_override_row && (
                      <button
                        type="button"
                        title="Reset to defaults"
                        aria-label="Reset to defaults"
                        disabled={busy === m.member_id}
                        onClick={() => reset(m)}
                        className="rounded border p-1.5 text-amber-700 border-amber-200 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <OverrideEditor
                    member={m}
                    chapter={chapter}
                    categoryOptions={categoryOptions}
                    busy={busy === m.member_id}
                    onCancel={() => setEditingId(null)}
                    onSave={async (overrides) => {
                      setBusy(m.member_id);
                      try {
                        await upsertVisibility({
                          member_id: m.member_id,
                          chapter,
                          visible: m.visible,
                          public_business_name: overrides.business_name,
                          public_category_id: overrides.category_id,
                        });
                        setEditingId(null);
                      } catch (e) {
                        alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OverrideEditor(props: {
  member: RosterMember;
  chapter: ChapterName;
  categoryOptions: { id: string; title: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (overrides: { business_name: string | null; category_id: string | null }) => void;
}) {
  const [business, setBusiness] = useState(props.member.public_business_name ?? '');
  const [categoryId, setCategoryId] = useState(props.member.public_category_id ?? '');

  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-3 border-t pt-3">
      <label className="block">
        <span className="text-xs font-medium block mb-1 text-gray-600">Public business name (overrides &ldquo;{props.member.member_company}&rdquo;)</span>
        <input
          className="w-full rounded border p-1.5 text-sm"
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
          placeholder="Leave blank to inherit"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium block mb-1 text-gray-600">Public category (overrides member&apos;s)</span>
        <select
          className="w-full rounded border p-1.5 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">— Inherit from member —</option>
          {props.categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
          <X size={12} /> Cancel
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={() => props.onSave({
            business_name: business.trim() || null,
            category_id: categoryId || null,
          })}
          className="inline-flex items-center gap-1 rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          <Save size={12} /> {props.busy ? 'Saving…' : 'Save overrides'}
        </button>
      </div>
    </div>
  );
}
