'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface SyncResult {
  success: boolean;
  total?: number;
  added?: number;
  updated?: number;
  error?: string;
}

interface SyncLogEntry {
  id: string;
  syncType: string;
  status: string;
  recordsSynced: number;
  recordsAdded: number;
  recordsUpdated: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function useWildApricot() {
  const [syncing, setSyncing] = useState<string | null>(null); // 'members' | 'events' | 'push' | null
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  const fetchSyncLogs = useCallback(async () => {
    if (!isConfigured) {
      setLogsLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('wa_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);

      if (data) {
        setSyncLogs(
          data.map((row: any) => ({
            id: row.id,
            syncType: row.sync_type,
            status: row.status,
            recordsSynced: row.records_synced || 0,
            recordsAdded: row.records_added || 0,
            recordsUpdated: row.records_updated || 0,
            error: row.error,
            startedAt: row.started_at,
            completedAt: row.completed_at,
          }))
        );
      }
    } catch {
      // Silently fail - table may not exist yet
    } finally {
      setLogsLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchSyncLogs();
  }, [fetchSyncLogs]);

  const syncMembers = async (): Promise<SyncResult> => {
    setSyncing('members');
    setLastResult(null);

    try {
      const response = await fetch('/api/wa/sync-members', { method: 'POST' });
      const data = await response.json();

      const result: SyncResult = response.ok
        ? { success: true, total: data.total, added: data.added, updated: data.updated }
        : { success: false, error: data.error };

      setLastResult(result);
      await fetchSyncLogs();
      return result;
    } catch (err) {
      const result: SyncResult = { success: false, error: 'Network error' };
      setLastResult(result);
      return result;
    } finally {
      setSyncing(null);
    }
  };

  const syncEvents = async (): Promise<SyncResult> => {
    setSyncing('events');
    setLastResult(null);

    try {
      const response = await fetch('/api/wa/sync-events', { method: 'POST' });
      const data = await response.json();

      const result: SyncResult = response.ok
        ? { success: true, total: data.total, added: data.added, updated: data.updated }
        : { success: false, error: data.error };

      setLastResult(result);
      await fetchSyncLogs();
      return result;
    } catch (err) {
      const result: SyncResult = { success: false, error: 'Network error' };
      setLastResult(result);
      return result;
    } finally {
      setSyncing(null);
    }
  };

  const pushToWA = async (guestId: string): Promise<SyncResult> => {
    setSyncing('push');
    setLastResult(null);

    try {
      const response = await fetch('/api/wa/push-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId }),
      });
      const data = await response.json();

      const result: SyncResult = response.ok
        ? { success: true }
        : { success: false, error: data.error };

      setLastResult(result);
      await fetchSyncLogs();
      return result;
    } catch (err) {
      const result: SyncResult = { success: false, error: 'Network error' };
      setLastResult(result);
      return result;
    } finally {
      setSyncing(null);
    }
  };

  // Get last successful sync time for each type
  const lastMemberSync = syncLogs.find(
    (l) => l.syncType === 'members' && l.status === 'success'
  );
  const lastEventSync = syncLogs.find(
    (l) => l.syncType === 'events' && l.status === 'success'
  );

  return {
    syncing,
    lastResult,
    syncLogs,
    logsLoading,
    syncMembers,
    syncEvents,
    pushToWA,
    lastMemberSync,
    lastEventSync,
    refetchLogs: fetchSyncLogs,
  };
}
