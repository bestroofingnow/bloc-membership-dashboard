'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Industry { id: string; name: string }
interface Category { id: string; industry_id: string; name: string }
interface Conflict { kind: 'none'|'exact'|'related'|'other'; occupant: { full_name: string; business_name: string } | null }

interface Props {
  token: string;
  sessionId: string;
  chapter: string;
  eventId: string;
  invitedByMemberId: string | null;
  qrTokenId: string;
  industries: Industry[];
  categories: Category[];
}

export function GuestDetailsForm(props: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () => props.categories.filter((c) => c.industry_id === industryId),
    [props.categories, industryId],
  );

  // Live conflict check, debounced. Only fires once both Industry and Category are picked —
  // before that the form is mid-input and a partial check would render a misleading panel.
  useEffect(() => {
    if (!industryId || !categoryId) { setConflict(null); return; }
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          chapter: props.chapter,
          industry_id: industryId,
          category_id: categoryId,
        });
        const res = await fetch(`/api/guest/check-conflict?${qs}`, { signal: ac.signal });
        if (res.ok) setConflict(await res.json());
      } catch {}
    }, 300);
    return () => { clearTimeout(id); ac.abort(); };
  }, [props.chapter, industryId, categoryId]);

  const isOther = !industryId || !categoryId;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/guest/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: props.token,
          session_id: props.sessionId,
          first_name: firstName,
          last_name: lastName,
          email,
          business_name: businessName,
          chapter: props.chapter,
          event_id: props.eventId,
          industry_id: isOther ? null : industryId,
          category_id: isOther ? null : categoryId,
          other_category_text: isOther ? (otherText || null) : null,
          invited_by_member_id: props.invitedByMemberId,
          qr_token_id: props.qrTokenId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorMsg(body?.error ?? `error_${res.status}`);
        setSubmitting(false);
        return;
      }
      router.push(`/guest/i/${props.token}/confirm?rsvp=${body.rsvp_id}`);
    } catch {
      setErrorMsg('network_error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field label="Business name" value={businessName} onChange={setBusinessName} />

      <div>
        <label className="block text-sm font-medium">Industry</label>
        <select
          className="mt-1 w-full rounded border p-2"
          value={industryId ?? ''}
          onChange={(e) => { setIndustryId(e.target.value || null); setCategoryId(null); }}
        >
          <option value="">— Select industry —</option>
          {props.industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Don&apos;t see your industry? Leave both selectors blank and describe your business below.</p>
      </div>

      {industryId && (
        <div>
          <label className="block text-sm font-medium">Category</label>
          <select
            className="mt-1 w-full rounded border p-2"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
          >
            <option value="">— Select category —</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {isOther && (
        <Field label="Describe your business" value={otherText} onChange={setOtherText} />
      )}

      {conflict && conflict.kind !== 'none' && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {conflict.kind === 'exact' && conflict.occupant && (
            <>Heads up — <strong>{conflict.occupant.full_name}</strong> ({conflict.occupant.business_name}) currently holds this category seat in {props.chapter}. You're welcome to attend as a guest of the chapter.</>
          )}
          {conflict.kind === 'related' && conflict.occupant && (
            <>FYI — <strong>{conflict.occupant.full_name}</strong> ({conflict.occupant.business_name}) is in a related category in {props.chapter}. You're still welcome to attend.</>
          )}
          {conflict.kind === 'other' && (
            <>We'll review your business and follow up about the right category for you.</>
          )}
        </div>
      )}

      {errorMsg && <p className="text-sm text-red-600">Error: {errorMsg}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-black px-6 py-3 text-white disabled:opacity-50"
      >
        {submitting ? 'Registering…' : 'Register for this event'}
      </button>
    </form>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium">{props.label}</label>
      <input
        className="mt-1 w-full rounded border p-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={props.type ?? 'text'}
        required={props.label !== 'Describe your business'}
      />
    </div>
  );
}
