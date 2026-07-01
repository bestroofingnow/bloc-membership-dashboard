'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Plus, X, Copy, RotateCcw, Check, Printer } from 'lucide-react';
import { useQrTokens, type MintQrInput } from '@/hooks/useQrTokens';
import { useEvents } from '@/hooks/useEvents';
import { useMembers } from '@/hooks/useMembers';
import { useAuth } from '@/contexts/AuthContext';
import { QrImage, useToast } from '@/components/ui';
import { guestInviteUrl } from '@/lib/links';
import type { ChapterName, QrTokenKindUI, QrTokenRow } from '@/types';

async function downloadQrPng(url: string, baseName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 1200,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${baseName.replace(/[^a-z0-9._-]+/gi, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const KINDS: { value: QrTokenKindUI; label: string; description: string }[] = [
  { value: 'general', label: 'General', description: 'Any guest, any event' },
  { value: 'chapter', label: 'Chapter-specific', description: 'Pins guest to one chapter' },
  { value: 'event', label: 'Event-specific', description: 'Pins guest to one event' },
  { value: 'member_invite', label: 'Member invite', description: 'Attributes to one member' },
  { value: 'after_hours', label: 'After Hours', description: 'Cross-chapter mixer' },
];
const CHAPTERS: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

export function QrTokensTab() {
  const { tokens, loading, error, canManage, mint, setRevoked, refresh } = useQrTokens();
  const { events } = useEvents();
  const { members } = useMembers();
  const { profile, isAdmin } = useAuth();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close the dialog on Escape (unless a mint is in flight).
  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setShowForm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, busy]);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  const [form, setForm] = useState<MintQrInput>({
    kind: 'general',
    chapter: null,
    event_id: null,
    invited_by_member_id: null,
    label: '',
  });

  const filtered = useMemo(
    () => tokens.filter((t) => !showOnlyActive || !t.revoked_at),
    [tokens, showOnlyActive],
  );

  const upcomingEvents = useMemo(
    () => events.filter((e) => new Date(e.starts_at).getTime() >= Date.now()),
    [events],
  );
  const membersForChapter = useMemo(() => {
    if (isAdmin) return members;
    if (profile?.chapter) return members.filter((m) => m.chapter === profile.chapter);
    return members;
  }, [members, isAdmin, profile?.chapter]);

  function origin(): string {
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }

  function publicUrl(token: string): string {
    return guestInviteUrl(origin(), token);
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
      toast.info('URL copied to clipboard');
    } catch {
      toast.error('Couldn\'t copy to clipboard — long-press to select the URL instead.');
    }
  }

  function resetForm() {
    setForm({
      kind: 'general',
      chapter: !isAdmin && profile?.chapter ? (profile.chapter as ChapterName) : null,
      event_id: null,
      invited_by_member_id: null,
      label: '',
    });
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      await mint(form);
      toast.success(`Minted new ${form.kind} QR${form.label ? `: ${form.label}` : ''}`);
      setShowForm(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFormError(msg);
      toast.error(`Mint failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRevoked(t: QrTokenRow) {
    const verb = t.revoked_at ? 'restore' : 'revoke';
    if (!confirm(`Are you sure you want to ${verb} "${t.label ?? t.token.slice(0, 12)}"?`)) return;
    try {
      await setRevoked(t.id, !t.revoked_at);
      toast.success(`${verb === 'revoke' ? 'Revoked' : 'Restored'} QR code`);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!canManage) {
    return <div className="text-sm text-gray-600">QR Manager is for directors and admins only.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><QrCode size={20} /> QR Manager</h2>
          <p className="text-sm text-gray-600">Mint, label, and revoke QR codes that route guests into the public flow.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              document.body.classList.add('print-qrs');
              window.print();
              setTimeout(() => document.body.classList.remove('print-qrs'), 200);
            }}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            title="Print visible QR codes as a one-per-page sheet"
          >
            <Printer size={14} /> Print sheet
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800">
            <Plus size={14} /> New QR code
          </button>
        </div>
      </div>

      {/* Print-only sheet: one card per visible token */}
      <div className="hidden print-qr-sheet">
        {filtered.map((t) => (
          <div key={`print-${t.id}`} className="print-qr-card">
            <QrImage url={publicUrl(t.token)} size={600} alt={`QR for ${t.label ?? t.kind}`} />
            <div className="print-qr-label">{t.label ?? `BLOC ${t.kind}`}</div>
            <div className="print-qr-meta">
              {t.chapter ?? 'Cross-chapter'}{t.event_title ? ` · ${t.event_title}` : ''}
              {t.invited_by_member_name ? ` · Invited by ${t.invited_by_member_name}` : ''}
            </div>
            <div className="print-qr-meta">{publicUrl(t.token)}</div>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showOnlyActive} onChange={(e) => setShowOnlyActive(e.target.checked)} />
        Hide revoked
      </label>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading && tokens.length === 0 ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">No QR codes yet. Mint one above.</div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => (
            <li key={t.id} className={`rounded border p-4 flex gap-4 items-start ${t.revoked_at ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
              <QrImage
                url={publicUrl(t.token)}
                size={120}
                alt={`QR code for ${t.label ?? t.kind}`}
                className="rounded border shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{t.label ?? <span className="text-gray-500 italic">(no label)</span>}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{t.kind}</span>
                  {t.chapter && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">{t.chapter}</span>}
                  {t.revoked_at && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">revoked</span>}
                </div>
                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                  {t.event_title && <div>Event: {t.event_title}</div>}
                  {t.invited_by_member_name && <div>Invited by: {t.invited_by_member_name}</div>}
                  <div>
                    Scans: <strong>{t.scan_count}</strong>
                    {t.last_scanned_at && <span className="ml-2 text-gray-500">last {new Date(t.last_scanned_at).toLocaleString()}</span>}
                  </div>
                  <div className="font-mono truncate text-[10px] text-gray-500" title={publicUrl(t.token)}>{publicUrl(t.token)}</div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => copyToClipboard(publicUrl(t.token), t.id)}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    {copiedId === t.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await downloadQrPng(publicUrl(t.token), t.label ?? `bloc-${t.kind}`);
                      if (r.ok) toast.success('PNG downloaded');
                      else toast.error(`Failed: ${r.error}`);
                    }}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    Download PNG
                  </button>
                  <button
                    onClick={() => toggleRevoked(t)}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${t.revoked_at ? 'hover:bg-green-50 text-green-700 border-green-200' : 'hover:bg-red-50 text-red-700 border-red-200'}`}
                  >
                    {t.revoked_at ? <><RotateCcw size={12} /> Restore</> : <><X size={12} /> Revoke</>}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setShowForm(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Mint new QR code</h3>

            <label className="block">
              <span className="text-sm font-medium block mb-1">Kind</span>
              <select className="w-full rounded border p-2" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as QrTokenKindUI })}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label} — {k.description}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium block mb-1">Chapter (optional)</span>
              <select className="w-full rounded border p-2" value={form.chapter ?? ''} onChange={(e) => setForm({ ...form, chapter: e.target.value || null })}>
                <option value="">— Cross-chapter / any —</option>
                {CHAPTERS.map((c) => <option key={c} value={c} disabled={!isAdmin && profile?.chapter !== c}>{c}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium block mb-1">Event (optional)</span>
              <select className="w-full rounded border p-2" value={form.event_id ?? ''} onChange={(e) => setForm({ ...form, event_id: e.target.value || null })}>
                <option value="">— Any event —</option>
                {upcomingEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({new Date(ev.starts_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>

            {form.kind === 'member_invite' && (
              <label className="block">
                <span className="text-sm font-medium block mb-1">Inviting member</span>
                <select className="w-full rounded border p-2" value={form.invited_by_member_id ?? ''} onChange={(e) => setForm({ ...form, invited_by_member_id: e.target.value || null })}>
                  <option value="">— Pick member —</option>
                  {membersForChapter.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.chapter})</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium block mb-1">Label (admin-facing)</span>
              <input className="w-full rounded border p-2" value={form.label ?? ''} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Uptown April After Hours - table tent #3" maxLength={200} />
            </label>

            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
              <button type="button" onClick={submit} disabled={busy} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
                {busy ? 'Minting…' : 'Mint QR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
