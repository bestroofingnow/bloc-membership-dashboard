'use client';

import { useCallback, useEffect, useState } from 'react';
import { Library, Plus, Pencil, Trash2, ExternalLink, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui';
import { validateResourceInput, RESOURCE_CATEGORIES } from '@/lib/resources/validate';
import { groupByCategory } from '@/lib/resources/group';

interface Resource {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
  chapter: string | null;
  public_visible: boolean;
}

const emptyForm = { title: '', description: '', url: '', category: 'Guide', public_visible: true };

/**
 * Manage the member Resource Library. Staff read all rows + write directly via
 * Supabase (RLS gates to admin/director). Validation reuses src/lib/resources.
 */
export function ResourcesTab() {
  const toast = useToast();
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('resources').select('*').order('title');
    if (error) setUnavailable(true);
    else {
      setItems((data ?? []) as Resource[]);
      setUnavailable(false);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }
  function openEdit(r: Resource) {
    setEditing(r);
    setForm({
      title: r.title,
      description: r.description ?? '',
      url: r.url ?? '',
      category: r.category ?? 'Guide',
      public_visible: r.public_visible,
    });
    setShowForm(true);
  }

  async function save() {
    const v = validateResourceInput(form);
    if (!v.ok) {
      toast.error(v.error ?? 'Invalid resource');
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      url: form.url.trim() || null,
      category: form.category || null,
      public_visible: form.public_visible,
    };
    const res = editing
      ? await supabase.from('resources').update(payload).eq('id', editing.id)
      : await supabase.from('resources').insert([payload]);
    setBusy(false);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success(editing ? 'Resource updated' : 'Resource added');
      setShowForm(false);
      load();
    }
  }

  async function remove(r: Resource) {
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('resources').delete().eq('id', r.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Deleted');
      load();
    }
  }

  const groups = groupByCategory(items);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Library size={20} /> Resource Library
          </h2>
          <p className="text-sm text-gray-600">Guides, forms, and links shown to members in the app.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          <Plus size={14} /> New resource
        </button>
      </div>

      {unavailable && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The resources table isn&apos;t available yet — run migration 035.
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No resources yet. Click “New resource” to add the first guide or link.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.category}>
            <h3 className="mb-2 text-sm uppercase tracking-wide text-gray-500">{g.category}</h3>
            <ul className="space-y-2">
              {g.items.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded border bg-white p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {r.title}
                      {!r.public_visible && (
                        <span className="inline-flex items-center gap-1 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
                          <EyeOff size={11} /> hidden
                        </span>
                      )}
                    </div>
                    {r.description && <div className="text-sm text-gray-600">{r.description}</div>}
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-bloc-blue hover:underline"
                      >
                        <ExternalLink size={11} /> {r.url}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => openEdit(r)} className="rounded p-2 text-slate-400 hover:bg-blue-50 hover:text-bloc-blue" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(r)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">{editing ? 'Edit resource' : 'New resource'}</h3>
            <label className="block text-sm">
              Title
              <input className="mt-1 w-full rounded border p-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="block text-sm">
              Link (https://…)
              <input className="mt-1 w-full rounded border p-2" type="url" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
            <label className="block text-sm">
              Category
              <select className="mt-1 w-full rounded border p-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Description
              <textarea className="mt-1 w-full rounded border p-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.public_visible} onChange={(e) => setForm({ ...form, public_visible: e.target.checked })} />
              Visible to members
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
              <button type="button" onClick={save} disabled={busy} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
