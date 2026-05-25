'use client';

import { useState } from 'react';
import { Calendar, Plus, Pencil, Trash2, EyeOff, Eye } from 'lucide-react';
import { useEvents, type EventInput } from '@/hooks/useEvents';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui';
import { toLocalDateTimeInput, fromLocalDateTimeInput } from '@/lib/datetime';
import type { ChapterName, EventKind, IntakeEvent } from '@/types';

const CHAPTERS: (ChapterName | '')[] = ['', 'North', 'South', 'Uptown', 'FLOC', 'Alumni'];
const KINDS: EventKind[] = ['lunch', 'after_hours', 'special'];

interface FormState {
  chapter: ChapterName | '';
  kind: EventKind;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location_name: string;
  location_address: string;
  public_visible: boolean;
}

const emptyForm: FormState = {
  chapter: '',
  kind: 'after_hours',
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location_name: '',
  location_address: '',
  public_visible: true,
};

// toLocalDateTimeInput / fromLocalDateTimeInput live in src/lib/datetime.ts (tested there).

export function EventsTab() {
  const { events, loading, error, canEdit, createEvent, updateEvent, deleteEvent, refresh } = useEvents();
  const { profile, isAdmin } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState<IntakeEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      chapter: (!isAdmin && profile?.chapter ? (profile.chapter as ChapterName) : ''),
    });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(ev: IntakeEvent) {
    setEditing(ev);
    setForm({
      chapter: ev.chapter ?? '',
      kind: ev.kind,
      title: ev.title,
      description: ev.description ?? '',
      starts_at: toLocalDateTimeInput(ev.starts_at),
      ends_at: toLocalDateTimeInput(ev.ends_at),
      location_name: ev.location_name ?? '',
      location_address: ev.location_address ?? '',
      public_visible: ev.public_visible,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      const payload: EventInput = {
        chapter: form.chapter === '' ? null : form.chapter,
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim() || null,
        starts_at: fromLocalDateTimeInput(form.starts_at),
        ends_at: fromLocalDateTimeInput(form.ends_at),
        location_name: form.location_name.trim() || null,
        location_address: form.location_address.trim() || null,
        public_visible: form.public_visible,
      };
      if (editing) {
        await updateEvent(editing.id, payload);
        toast.success(`Updated "${payload.title}"`);
      } else {
        await createEvent(payload);
        toast.success(`Created "${payload.title}"`);
      }
      setShowForm(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFormError(msg);
      toast.error(`Save failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ev: IntakeEvent) {
    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(ev.id);
      toast.success(`Deleted "${ev.title}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Delete failed: ${msg}`);
    }
  }

  async function toggleVisibility(ev: IntakeEvent) {
    try {
      await updateEvent(ev.id, { public_visible: !ev.public_visible });
      toast.success(ev.public_visible ? `"${ev.title}" hidden from public` : `"${ev.title}" now visible to public`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Update failed: ${msg}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar size={20} /> Events
          </h2>
          <p className="text-sm text-gray-600">
            These events power the public guest RSVP picker at <code className="text-xs">/guest</code>.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
          >
            <Plus size={14} /> New event
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Section title="Upcoming" events={upcoming} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onToggle={toggleVisibility} loading={loading} />
      <Section title="Past" events={past} canEdit={canEdit} onEdit={openEdit} onDelete={remove} onToggle={toggleVisibility} loading={loading} dim />

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">{editing ? 'Edit event' : 'New event'}</h3>

            <FormField label="Title">
              <input className="w-full rounded border p-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Chapter">
                <select className="w-full rounded border p-2" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value as ChapterName | '' })}>
                  {CHAPTERS.map((c) => <option key={c} value={c}>{c === '' ? '— Cross-chapter —' : c}</option>)}
                </select>
              </FormField>
              <FormField label="Kind">
                <select className="w-full rounded border p-2" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EventKind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Starts">
                <input type="datetime-local" className="w-full rounded border p-2" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
              </FormField>
              <FormField label="Ends">
                <input type="datetime-local" className="w-full rounded border p-2" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required />
              </FormField>
            </div>
            <FormField label="Location name">
              <input className="w-full rounded border p-2" value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
            </FormField>
            <FormField label="Address">
              <input className="w-full rounded border p-2" value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} />
            </FormField>
            <FormField label="Description">
              <textarea className="w-full rounded border p-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.public_visible} onChange={(e) => setForm({ ...form, public_visible: e.target.checked })} />
              Visible on the public guest flow
            </label>

            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}

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

function Section(props: {
  title: string;
  events: IntakeEvent[];
  canEdit: boolean;
  onEdit: (e: IntakeEvent) => void;
  onDelete: (e: IntakeEvent) => void;
  onToggle: (e: IntakeEvent) => void;
  loading: boolean;
  dim?: boolean;
}) {
  if (props.events.length === 0 && !props.loading) return null;
  return (
    <div className={props.dim ? 'opacity-70' : ''}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 mb-2">{props.title}</h3>
      <ul className="space-y-2">
        {props.events.map((e) => (
          <li key={e.id} className="rounded border bg-white p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-gray-600">
                {new Date(e.starts_at).toLocaleString()} → {new Date(e.ends_at).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {e.chapter ?? 'cross-chapter'} · {e.kind}{e.location_name ? ` · ${e.location_name}` : ''}
                {!e.public_visible && <span className="ml-2 inline-block rounded bg-gray-200 px-1.5 py-0.5 text-gray-700">hidden</span>}
              </div>
            </div>
            {props.canEdit && (
              <div className="flex gap-1 shrink-0">
                <IconBtn label={e.public_visible ? 'Hide from public' : 'Show on public'} onClick={() => props.onToggle(e)}>
                  {e.public_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </IconBtn>
                <IconBtn label="Edit" onClick={() => props.onEdit(e)}><Pencil size={14} /></IconBtn>
                <IconBtn label="Delete" onClick={() => props.onDelete(e)} danger><Trash2 size={14} /></IconBtn>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1">{props.label}</span>
      {props.children}
    </label>
  );
}

function IconBtn(props: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`rounded border p-1.5 hover:bg-gray-50 ${props.danger ? 'text-red-600 hover:bg-red-50 border-red-200' : ''}`}
    >
      {props.children}
    </button>
  );
}
