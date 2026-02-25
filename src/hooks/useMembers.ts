'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchMembers = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else if (data && data.length > 0) {
        setMembers(data.map(transformDbToMember));
      }
      // Keep static members if no DB data
    } catch (err) {
      console.error('Fetch members error:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchMembers();

    if (!isConfigured) return;

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
  }, [fetchMembers, isConfigured]);

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

  return {
    members,
    loading,
    error,
    membersByChapter,
    chapterCounts,
    searchMembers,
    getMembersByChapter,
    refetch: fetchMembers,
  };
}
