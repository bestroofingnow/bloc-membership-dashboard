'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface NetworkingStatsRow {
  member_id: string;
  name: string;
  chapter: string | null;
  meetings: number;
  connections: number;
  connectionsConverted: number;
  referralsGiven: number;
  referralsReceived: number;
  referralsClosed: number;
  referralsClosedValue: number;
}

/**
 * Admin-facing aggregate activity per member — counts only, sourced entirely
 * from the v_meeting_stats/v_connection_stats/v_referral_stats views (never
 * the raw meeting/connection/referral tables), so no meeting notes or
 * connection contact details are exposed here.
 */
export function useNetworkingStats() {
  const { session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [rows, setRows] = useState<NetworkingStatsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, meetingsRes, connectionsRes, referralsRes] = await Promise.all([
        supabase.from('members').select('id, name, chapter'),
        supabase.from('v_meeting_stats').select('member_id, meetings_count'),
        supabase.from('v_connection_stats').select('member_id, connections_count, converted_count'),
        supabase.from('v_referral_stats').select('member_id, given, received, closed, closed_value'),
      ]);
      const firstError =
        membersRes.error || meetingsRes.error || connectionsRes.error || referralsRes.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      const meetingsById = new Map((meetingsRes.data ?? []).map((r) => [r.member_id, r.meetings_count]));
      const connectionsById = new Map(
        (connectionsRes.data ?? []).map((r) => [r.member_id, r]),
      );
      const referralsById = new Map((referralsRes.data ?? []).map((r) => [r.member_id, r]));

      const combined: NetworkingStatsRow[] = (membersRes.data ?? []).map((m) => {
        const conn = connectionsById.get(m.id);
        const ref = referralsById.get(m.id);
        return {
          member_id: m.id,
          name: m.name,
          chapter: m.chapter,
          meetings: meetingsById.get(m.id) ?? 0,
          connections: conn?.connections_count ?? 0,
          connectionsConverted: conn?.converted_count ?? 0,
          referralsGiven: ref?.given ?? 0,
          referralsReceived: ref?.received ?? 0,
          referralsClosed: ref?.closed ?? 0,
          referralsClosedValue: ref?.closed_value ?? 0,
        };
      });
      setRows(combined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
