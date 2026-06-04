'use client';

import { useState } from 'react';
import { User, Eye, EyeOff, AlertCircle, RotateCcw } from 'lucide-react';
import { useMyMember } from '@/hooks/useMyMember';
import { useMyFieldVisibility } from '@/hooks/useMyFieldVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui';
import type { ChapterName } from '@/types';

export function MyProfileTab() {
  const { profile } = useAuth();
  const { member, visibilities, loading, error, setMyVisibility, refresh } = useMyMember();
  const { flags, setMyFlags } = useMyFieldVisibility();
  const [busy, setBusy] = useState<string | null>(null);
  const [fieldBusy, setFieldBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const toast = useToast();

  async function toggleField(field: 'show_mobile_phone' | 'show_address' | 'show_birthday', next: boolean) {
    setFieldBusy(field);
    setActionError(null);
    try {
      await setMyFlags({ ...flags, [field]: next });
      toast.success(next ? 'Field is now visible to other members' : 'Field is now hidden from other members');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      toast.error(`Update failed: ${msg}`);
    } finally {
      setFieldBusy(null);
    }
  }

  async function toggle(chapter: ChapterName, next: boolean) {
    setBusy(chapter);
    setActionError(null);
    try {
      await setMyVisibility(chapter, next);
      toast.success(next ? 'You are now visible on the public roster' : 'You are now hidden from the public roster');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      toast.error(`Update failed: ${msg}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !member) {
    return <div className="text-sm text-gray-500">Loading your profile…</div>;
  }

  if (!member) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><User size={20} /> My Profile</h2>
        <div className="rounded border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">We couldn&apos;t find a member record matching your login email.</p>
            <p className="mt-1">
              Your account email <code className="font-mono">{profile?.email}</code> doesn&apos;t match any active member.
              Ask your chapter director to confirm the email on your member record, then click refresh.
            </p>
            <button onClick={refresh} className="mt-3 rounded border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-100">
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><User size={20} /> My Profile</h2>
        <p className="text-sm text-gray-600">Your member record and how you appear to guests visiting the public BLOC site.</p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded border bg-white p-4 space-y-1">
        <h3 className="text-sm uppercase tracking-wide text-gray-500">Member info</h3>
        <div className="text-lg font-medium">{member.name}</div>
        <div className="text-sm">{member.company}</div>
        <div className="text-xs text-gray-500">
          {member.chapter} chapter
          {member.category_title && ` · ${member.category_title}`}
        </div>
        <div className="text-xs text-gray-500">{member.email}{member.phone ? ` · ${member.phone}` : ''}</div>
        <p className="text-xs text-gray-400 mt-3">
          To change your name, business, email, or chapter, ask your chapter director.
        </p>
      </section>

      <section className="rounded border bg-white p-4 space-y-3">
        <div>
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Public roster visibility</h3>
          <p className="text-xs text-gray-600 mt-1">
            When guests scan a chapter QR code, they see a preview of who&apos;s in the room.
            You can choose whether to appear in that preview.
          </p>
        </div>
        {actionError && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}
        <ul className="space-y-2">
          {visibilities.map((v) => (
            <li key={v.chapter} className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="font-medium">{v.chapter}</div>
                <div className="text-xs text-gray-500">
                  {v.visible
                    ? 'Guests will see your name and business on this chapter\'s public roster preview.'
                    : 'You are hidden from this chapter\'s public roster preview.'}
                </div>
                {v.has_override_row && (v.public_business_name || v.public_category_id) && (
                  <div className="text-xs text-amber-700 mt-1">
                    A director has set custom public overrides on your profile.
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busy === v.chapter}
                  onClick={() => toggle(v.chapter, !v.visible)}
                  aria-pressed={!v.visible}
                  className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                    v.visible
                      ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                      : 'border-gray-300 text-gray-700 bg-gray-50 hover:bg-gray-100'
                  } disabled:opacity-50`}
                >
                  {v.visible ? <><Eye size={14} /> Visible</> : <><EyeOff size={14} /> Hidden</>}
                </button>
                {v.has_override_row && (v.public_business_name || v.public_category_id) && (
                  <button
                    type="button"
                    disabled={busy === v.chapter}
                    onClick={async () => {
                      if (!confirm(`Clear public overrides on your ${v.chapter} chapter profile? You’ll be shown with your default member name and category.`)) return;
                      setBusy(v.chapter);
                      setActionError(null);
                      try {
                        await setMyVisibility(v.chapter, v.visible);
                        toast.success('Overrides cleared');
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        setActionError(msg);
                        toast.error(`Clear failed: ${msg}`);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    title="Clear director-set overrides"
                    aria-label="Clear director-set overrides"
                    className="rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1.5 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border bg-white p-4 space-y-3">
        <div>
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Personal info visibility</h3>
          <p className="text-xs text-gray-600 mt-1">
            Your mobile phone, home address, and birthday are hidden from other members by default.
            Turn on any field to share it in the member directory. Your business email and phone are always shown.
          </p>
        </div>
        {([
          { key: 'show_mobile_phone', label: 'Mobile phone' },
          { key: 'show_address', label: 'Home address' },
          { key: 'show_birthday', label: 'Birthday' },
        ] as const).map((f) => {
          const on = flags[f.key];
          return (
            <div key={f.key} className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-gray-500">
                  {on ? 'Visible to other logged-in members.' : 'Hidden from other members (directors/admins can still see it).'}
                </div>
              </div>
              <button
                type="button"
                disabled={fieldBusy === f.key}
                onClick={() => toggleField(f.key, !on)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                  on
                    ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'border-gray-300 text-gray-700 bg-gray-50 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                {on ? <><Eye size={14} /> Shared</> : <><EyeOff size={14} /> Hidden</>}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
