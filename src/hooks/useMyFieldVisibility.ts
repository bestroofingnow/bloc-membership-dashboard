'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface MyFieldVisibility {
  show_mobile_phone: boolean;
  show_address: boolean;
  show_birthday: boolean;
}

const ALL_HIDDEN: MyFieldVisibility = {
  show_mobile_phone: false,
  show_address: false,
  show_birthday: false,
};

/**
 * Reads and writes the caller's own member_field_visibility flags.
 * Read goes through member_directory ownership semantics (the owner sees their
 * own member id); write goes through the service-role /api/me/field-visibility.
 */
export function useMyFieldVisibility() {
  const { profile, session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [flags, setFlags] = useState<MyFieldVisibility>(ALL_HIDDEN);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session || !profile?.email) {
      setMemberId(null);
      setFlags(ALL_HIDDEN);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const email = profile.email.toLowerCase();
      const { data: memRows, error: mErr } = await supabase
        .from('members')
        .select('id')
        .ilike('email', email)
        .limit(1);
      if (mErr) {
        setError(mErr.message);
        setMemberId(null);
        return;
      }
      const mid = (memRows ?? [])[0]?.id as string | undefined;
      if (!mid) {
        setMemberId(null);
        setFlags(ALL_HIDDEN);
        return;
      }
      setMemberId(mid);
      const { data: vis } = await supabase
        .from('member_field_visibility')
        .select('show_mobile_phone,show_address,show_birthday')
        .eq('member_id', mid)
        .maybeSingle();
      setFlags(vis ? (vis as MyFieldVisibility) : ALL_HIDDEN);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, profile?.email]);

  useEffect(() => { load(); }, [load]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const setMyFlags = useCallback(async (next: MyFieldVisibility) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/me/field-visibility', {
      method: 'POST',
      headers,
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `update_failed_${res.status}`);
    }
    setFlags(next);
  }, [authHeaders]);

  return { flags, memberId, loading, error, refresh: load, setMyFlags };
}
