'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { IntakeGuestRow } from '@/types';

interface RawRsvpRow {
  id: string;
  status: string;
  conflict_kind: string;
  submitted_at: string;
  guest_id: string;
  invited_by_member_id: string | null;
  conflict_member_id: string | null;
  intake_guests: {
    first_name: string;
    last_name: string;
    email: string;
    business_name: string;
    other_category_text: string | null;
  };
  events: {
    title: string;
    starts_at: string;
    chapter: string | null;
  };
}

/**
 * Loads intake_rsvps with joined guest + event details for the membership-team
 * Guest Inbox. Filters by chapter for `chapter_director` role; admins see all.
 * Members see nothing (caller should hide the tab).
 */
export function useIntakeGuests() {
  const [rows, setRows] = useState<IntakeGuestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profile, isAdmin, isDirector, session } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchRows = useCallback(async () => {
    if (!isConfigured || !session || (!isAdmin && !isDirector)) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('intake_rsvps')
        .select(`
          id,
          status,
          conflict_kind,
          submitted_at,
          guest_id,
          invited_by_member_id,
          conflict_member_id,
          intake_guests!inner(first_name,last_name,email,business_name,other_category_text),
          events!inner(title,starts_at,chapter)
        `)
        .order('submitted_at', { ascending: false })
        .limit(500);
      // Directors see only their chapter's events; admins see everything.
      if (isDirector && !isAdmin && profile?.chapter) {
        q = q.eq('events.chapter', profile.chapter);
      }
      const { data, error: fetchErr } = await q;
      if (fetchErr) {
        setError(fetchErr.message);
        setRows([]);
        return;
      }
      const raw = (data ?? []) as unknown as RawRsvpRow[];

      // Look up member names (inviter + conflict occupant) in one batch
      const memberIds = Array.from(new Set(
        raw.flatMap((r) => [r.invited_by_member_id, r.conflict_member_id]).filter(Boolean) as string[]
      ));
      const memberNames = new Map<string, string>();
      if (memberIds.length > 0) {
        const { data: mems } = await supabase
          .from('members')
          .select('id,name')
          .in('id', memberIds);
        for (const m of (mems ?? []) as Array<{ id: string; name: string }>) {
          memberNames.set(m.id, m.name);
        }
      }

      // Unresolved side-effect failures per rsvp
      const rsvpIds = raw.map((r) => r.id);
      const unresolved = new Set<string>();
      if (rsvpIds.length > 0) {
        const { data: failures } = await supabase
          .from('intake_side_effect_failures')
          .select('rsvp_id')
          .is('resolved_at', null)
          .in('rsvp_id', rsvpIds);
        for (const f of (failures ?? []) as Array<{ rsvp_id: string }>) {
          unresolved.add(f.rsvp_id);
        }
      }

      const mapped: IntakeGuestRow[] = raw.map((r) => ({
        rsvp_id: r.id,
        guest_id: r.guest_id,
        first_name: r.intake_guests.first_name,
        last_name: r.intake_guests.last_name,
        email: r.intake_guests.email,
        business_name: r.intake_guests.business_name,
        other_category_text: r.intake_guests.other_category_text,
        chapter: (r.events.chapter as IntakeGuestRow['chapter']) ?? null,
        event_title: r.events.title,
        event_starts_at: r.events.starts_at,
        conflict_kind: r.conflict_kind as IntakeGuestRow['conflict_kind'],
        conflict_member_name: r.conflict_member_id ? memberNames.get(r.conflict_member_id) ?? null : null,
        status: r.status as IntakeGuestRow['status'],
        invited_by_member_name: r.invited_by_member_id ? memberNames.get(r.invited_by_member_id) ?? null : null,
        submitted_at: r.submitted_at,
        has_unresolved_side_effects: unresolved.has(r.id),
      }));
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, isAdmin, isDirector, profile?.chapter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const setStatus = useCallback(async (rsvpId: string, status: 'registered' | 'attended' | 'no_show' | 'canceled') => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/admin/intake-rsvps/${rsvpId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `status_update_failed_${res.status}`);
    }
    // Optimistic local update
    setRows((prev) => prev.map((r) => (r.rsvp_id === rsvpId ? { ...r, status } : r)));
  }, [authHeaders]);

  const markSyncResolved = useCallback(async (rsvpId: string) => {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/intake-side-effect/${rsvpId}/resolve`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `resolve_failed_${res.status}`);
    }
    setRows((prev) => prev.map((r) => (r.rsvp_id === rsvpId ? { ...r, has_unresolved_side_effects: false } : r)));
  }, [authHeaders]);

  return { rows, loading, error, refresh: fetchRows, setStatus, markSyncResolved };
}
