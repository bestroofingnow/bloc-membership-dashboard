'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { IntakeEvent } from '@/types';

export type EventInput = Omit<IntakeEvent, 'id' | 'created_at' | 'ics_uid'> & {
  ics_uid?: string; // optional on create — server generates if absent
};

/**
 * Loads + mutates events for the public guest flow. Visible to anyone
 * authenticated, mutable only by director/admin (server enforces).
 */
export function useEvents() {
  const [events, setEvents] = useState<IntakeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, isAdmin, isDirector } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchEvents = useCallback(async () => {
    if (!isConfigured || !session) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('events')
        .select('id,chapter,kind,title,description,starts_at,ends_at,location_name,location_address,public_url,ics_uid,public_visible,created_at')
        .order('starts_at', { ascending: true });
      if (fetchErr) {
        setError(fetchErr.message);
        setEvents([]);
        return;
      }
      setEvents((data ?? []) as IntakeEvent[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Realtime: any mutation refreshes the list
  useEffect(() => {
    if (!isConfigured || !session) return;
    const ch = supabase
      .channel('events-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchEvents())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isConfigured, session, fetchEvents]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const createEvent = useCallback(async (input: EventInput) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/admin/events', { method: 'POST', headers, body: JSON.stringify(input) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `create_failed_${res.status}`);
    }
    return await res.json() as { id: string };
  }, [authHeaders]);

  const updateEvent = useCallback(async (id: string, patch: Partial<EventInput>) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/admin/events/${id}`, { method: 'PATCH', headers, body: JSON.stringify(patch) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `update_failed_${res.status}`);
    }
  }, [authHeaders]);

  const deleteEvent = useCallback(async (id: string) => {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `delete_failed_${res.status}`);
    }
  }, [authHeaders]);

  return {
    events,
    loading,
    error,
    canEdit: isAdmin || isDirector,
    refresh: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
