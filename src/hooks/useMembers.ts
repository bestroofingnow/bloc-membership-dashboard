'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Member, ChapterName } from '@/types';
import { members as staticMembers } from '@/data/members';

function transformDbToMember(row: any): Member {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    chapter: row.chapter as ChapterName,
    industry: row.industry,
    email: row.email || undefined,
    phone: row.phone || undefined,
  };
}

export function useMembers() {
  const [members, setMembers] = useState<Member[]>(staticMembers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, session } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchMembers = useCallback(async () => {
    if (!isConfigured || !session) {
      return;
    }

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else if (data) {
        setMembers(data.length > 0 ? data.map(transformDbToMember) : []);
      }
    } catch (err) {
      console.error('Fetch members error:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    fetchMembers();

    if (!isConfigured || !session) return;

    // Set up realtime subscription
    const channel = supabase
      .channel('members-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMember = transformDbToMember(payload.new);
            setMembers((prev) => [...prev, newMember].sort((a, b) => a.name.localeCompare(b.name)));
          } else if (payload.eventType === 'UPDATE') {
            const updatedMember = transformDbToMember(payload.new);
            setMembers((prev) =>
              prev.map((m) => (m.id === updatedMember.id ? updatedMember : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMembers((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembers, isConfigured, session]);

  const addMember = async (
    memberData: Omit<Member, 'id'>
  ): Promise<Member | null> => {
    if (!isConfigured) {
      const newMember: Member = { ...memberData, id: crypto.randomUUID() };
      setMembers((prev) => [...prev, newMember].sort((a, b) => a.name.localeCompare(b.name)));
      return newMember;
    }

    if (!canEdit) {
      setError('You do not have permission to add members');
      return null;
    }

    try {
      const { data, error: insertError } = await supabase
        .from('members')
        .insert([{
          name: memberData.name,
          company: memberData.company,
          chapter: memberData.chapter,
          industry: memberData.industry,
          email: memberData.email || null,
          phone: memberData.phone || null,
        }])
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return null;
      }

      return data ? transformDbToMember(data) : null;
    } catch (err) {
      setError('Failed to add member');
      return null;
    }
  };

  const updateMember = async (
    id: string,
    updates: Partial<Member>
  ): Promise<Member | null> => {
    if (!isConfigured) {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
      return members.find((m) => m.id === id) || null;
    }

    if (!canEdit) {
      setError('You do not have permission to update members');
      return null;
    }

    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.company !== undefined) dbUpdates.company = updates.company;
      if (updates.chapter !== undefined) dbUpdates.chapter = updates.chapter;
      if (updates.industry !== undefined) dbUpdates.industry = updates.industry;
      if (updates.email !== undefined) dbUpdates.email = updates.email || null;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;

      const { data, error: updateError } = await supabase
        .from('members')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        setError(updateError.message);
        return null;
      }

      return data ? transformDbToMember(data) : null;
    } catch (err) {
      setError('Failed to update member');
      return null;
    }
  };

  const deleteMember = async (id: string): Promise<boolean> => {
    if (!isConfigured) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      return true;
    }

    if (!canEdit) {
      setError('You do not have permission to delete members');
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from('members')
        .delete()
        .eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      return true;
    } catch (err) {
      setError('Failed to delete member');
      return false;
    }
  };

  // Computed values
  const membersByChapter = useMemo(() => {
    const result: Record<ChapterName, Member[]> = {
      North: [],
      South: [],
      Uptown: [],
      FLOC: [],
      Alumni: [],
    };
    members.forEach((m) => {
      if (result[m.chapter]) {
        result[m.chapter].push(m);
      }
    });
    return result;
  }, [members]);

  const chapterCounts = useMemo(() => {
    return {
      North: membersByChapter.North.length,
      South: membersByChapter.South.length,
      Uptown: membersByChapter.Uptown.length,
      FLOC: membersByChapter.FLOC.length,
      Alumni: membersByChapter.Alumni.length,
    };
  }, [membersByChapter]);

  const searchMembers = useCallback(
    (query: string): Member[] => {
      const lowerQuery = query.toLowerCase();
      return members.filter(
        (m) =>
          m.name.toLowerCase().includes(lowerQuery) ||
          m.company.toLowerCase().includes(lowerQuery) ||
          m.chapter.toLowerCase().includes(lowerQuery) ||
          m.industry.toLowerCase().includes(lowerQuery)
      );
    },
    [members]
  );

  const getMembersByChapter = useCallback(
    (chapter: ChapterName): Member[] => {
      return membersByChapter[chapter] || [];
    },
    [membersByChapter]
  );

  const clearError = () => setError(null);

  return {
    members,
    loading,
    error,
    membersByChapter,
    chapterCounts,
    searchMembers,
    getMembersByChapter,
    addMember,
    updateMember,
    deleteMember,
    clearError,
    refetch: fetchMembers,
  };
}
