'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { UserRole, ChapterName } from '@/contexts/AuthContext';

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  chapter: ChapterName | null;
  createdAt: string;
}

function transformDbToProfile(row: any): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as UserRole,
    chapter: row.chapter as ChapterName | null,
    createdAt: row.created_at,
  };
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchProfiles = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching profiles:', fetchError);
      } else if (data) {
        setProfiles(data.map(transformDbToProfile));
      }
    } catch (err) {
      console.error('Fetch profiles error:', err);
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const updateProfile = async (
    userId: string,
    updates: { role?: UserRole; chapter?: ChapterName | null }
  ): Promise<{ error: string | null }> => {
    if (!isConfigured) {
      return { error: 'Supabase not configured' };
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (updateError) {
        return { error: updateError.message };
      }

      await fetchProfiles();
      return { error: null };
    } catch (err) {
      return { error: 'Failed to update profile' };
    }
  };

  const deleteProfile = async (userId: string): Promise<{ error: string | null }> => {
    if (!isConfigured) {
      return { error: 'Supabase not configured' };
    }

    try {
      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (deleteError) {
        return { error: deleteError.message };
      }

      await fetchProfiles();
      return { error: null };
    } catch (err) {
      return { error: 'Failed to remove user' };
    }
  };

  return {
    profiles,
    loading,
    error,
    updateProfile,
    deleteProfile,
    refetch: fetchProfiles,
  };
}
