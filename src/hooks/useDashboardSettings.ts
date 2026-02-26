'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChapterName } from '@/types';

// Default values (used as fallback)
const DEFAULTS: Record<string, string> = {
  target_members: '125',
  chapter_goal_north: '30',
  chapter_goal_south: '25',
  chapter_goal_uptown: '30',
  chapter_goal_floc: '30',
  chapter_goal_alumni: '20',
  impact_referrals: '10,000+',
  impact_transactions: '9,000+',
  impact_charity: '$732,171.45',
};

export function useDashboardSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin, session } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchSettings = useCallback(async () => {
    if (!isConfigured || !session) return;

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('dashboard_settings')
        .select('key, value');

      if (fetchError) {
        console.error('Error fetching dashboard settings:', fetchError);
      } else if (data && data.length > 0) {
        const fetched: Record<string, string> = {};
        data.forEach((row) => {
          fetched[row.key] = row.value;
        });
        setSettings((prev) => ({ ...prev, ...fetched }));
      }
    } catch (err) {
      console.error('Fetch dashboard settings error:', err);
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(
    async (key: string, value: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setSettings((prev) => ({ ...prev, [key]: value }));
        return { error: null };
      }

      if (!isAdmin) return { error: 'Permission denied' };

      try {
        const { error: upsertError } = await supabase
          .from('dashboard_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

        if (upsertError) return { error: upsertError.message };

        setSettings((prev) => ({ ...prev, [key]: value }));
        return { error: null };
      } catch {
        return { error: 'Failed to update setting' };
      }
    },
    [isConfigured, isAdmin]
  );

  const updateMultiple = useCallback(
    async (updates: Record<string, string>): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setSettings((prev) => ({ ...prev, ...updates }));
        return { error: null };
      }

      if (!isAdmin) return { error: 'Permission denied' };

      try {
        const rows = Object.entries(updates).map(([key, value]) => ({
          key,
          value,
          updated_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from('dashboard_settings')
          .upsert(rows, { onConflict: 'key' });

        if (upsertError) return { error: upsertError.message };

        setSettings((prev) => ({ ...prev, ...updates }));
        return { error: null };
      } catch {
        return { error: 'Failed to update settings' };
      }
    },
    [isConfigured, isAdmin]
  );

  // Convenience getters
  const targetMembers = parseInt(settings.target_members) || 125;

  const chapterGoals: Record<ChapterName, number> = {
    North: parseInt(settings.chapter_goal_north) || 30,
    South: parseInt(settings.chapter_goal_south) || 25,
    Uptown: parseInt(settings.chapter_goal_uptown) || 30,
    FLOC: parseInt(settings.chapter_goal_floc) || 30,
    Alumni: parseInt(settings.chapter_goal_alumni) || 20,
  };

  const impactStats = {
    referrals: settings.impact_referrals || '10,000+',
    transactions: settings.impact_transactions || '9,000+',
    charity: settings.impact_charity || '$732,171.45',
  };

  return {
    settings,
    loading,
    error,
    updateSetting,
    updateMultiple,
    targetMembers,
    chapterGoals,
    impactStats,
    refetch: fetchSettings,
  };
}
