'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { QrTokenKindUI, QrTokenRow } from '@/types';

export interface MintQrInput {
  kind: QrTokenKindUI;
  chapter?: string | null;
  event_id?: string | null;
  invited_by_member_id?: string | null;
  label?: string;
}

interface RawRow {
  id: string;
  token: string;
  kind: string;
  chapter: string | null;
  event_id: string | null;
  invited_by_member_id: string | null;
  label: string | null;
  scan_count: number;
  last_scanned_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function useQrTokens() {
  const [tokens, setTokens] = useState<QrTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, isAdmin, isDirector, profile } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const canManage = isAdmin || isDirector;

  const fetchTokens = useCallback(async () => {
    if (!isConfigured || !session || !canManage) {
      setTokens([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('qr_tokens')
        .select('id,token,kind,chapter,event_id,invited_by_member_id,label,scan_count,last_scanned_at,revoked_at,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (isDirector && !isAdmin && profile?.chapter) {
        // Directors see their chapter's QRs + cross-chapter QRs they might use
        q = q.or(`chapter.eq.${profile.chapter},chapter.is.null`);
      }
      const { data, error: fetchErr } = await q;
      if (fetchErr) {
        setError(fetchErr.message);
        setTokens([]);
        return;
      }
      const raw = (data ?? []) as RawRow[];

      // Batch lookups
      const eventIds = Array.from(new Set(raw.map((r) => r.event_id).filter(Boolean) as string[]));
      const memberIds = Array.from(new Set(raw.map((r) => r.invited_by_member_id).filter(Boolean) as string[]));
      const eventTitles = new Map<string, string>();
      const memberNames = new Map<string, string>();
      if (eventIds.length > 0) {
        const { data: evs } = await supabase.from('events').select('id,title').in('id', eventIds);
        for (const e of (evs ?? []) as Array<{ id: string; title: string }>) eventTitles.set(e.id, e.title);
      }
      if (memberIds.length > 0) {
        const { data: mems } = await supabase.from('members').select('id,name').in('id', memberIds);
        for (const m of (mems ?? []) as Array<{ id: string; name: string }>) memberNames.set(m.id, m.name);
      }

      const mapped: QrTokenRow[] = raw.map((r) => ({
        id: r.id,
        token: r.token,
        kind: r.kind as QrTokenKindUI,
        chapter: r.chapter as QrTokenRow['chapter'],
        event_id: r.event_id,
        event_title: r.event_id ? eventTitles.get(r.event_id) ?? null : null,
        invited_by_member_id: r.invited_by_member_id,
        invited_by_member_name: r.invited_by_member_id ? memberNames.get(r.invited_by_member_id) ?? null : null,
        label: r.label,
        scan_count: r.scan_count,
        last_scanned_at: r.last_scanned_at,
        revoked_at: r.revoked_at,
        created_at: r.created_at,
      }));
      setTokens(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, canManage, isAdmin, isDirector, profile?.chapter]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  useEffect(() => {
    if (!isConfigured || !session || !canManage) return;
    const ch = supabase
      .channel('qr-tokens-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_tokens' }, () => fetchTokens())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isConfigured, session, canManage, fetchTokens]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const mint = useCallback(async (input: MintQrInput) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/admin/qr-tokens', { method: 'POST', headers, body: JSON.stringify(input) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `mint_failed_${res.status}`);
    }
    return await res.json() as { id: string; token: string; url: string };
  }, [authHeaders]);

  const setRevoked = useCallback(async (id: string, revoked: boolean) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/admin/qr-tokens/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ revoked }) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `revoke_failed_${res.status}`);
    }
  }, [authHeaders]);

  return { tokens, loading, error, canManage, refresh: fetchTokens, mint, setRevoked };
}
