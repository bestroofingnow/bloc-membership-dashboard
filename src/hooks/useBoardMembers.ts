'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { BoardMember } from '@/types';
import { boardMembers as staticBoard } from '@/data/board';

function transformDbToBoardMember(row: any): BoardMember {
  return {
    role: row.role,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
  };
}

export function useBoardMembers() {
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>(staticBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchBoardMembers = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('board_members')
        .select('*')
        .order('role', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching board members:', fetchError);
      } else if (data && data.length > 0) {
        setBoardMembers(data.map(transformDbToBoardMember));
      }
      // Keep static data if no DB data
    } catch (err) {
      console.error('Fetch board members error:', err);
      setError('Failed to load board members');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchBoardMembers();
  }, [fetchBoardMembers]);

  // Group board members by role for display
  const boardByRole = boardMembers.reduce((acc, member) => {
    if (!acc[member.role]) {
      acc[member.role] = [];
    }
    acc[member.role].push(member);
    return acc;
  }, {} as Record<string, BoardMember[]>);

  return {
    boardMembers,
    boardByRole,
    loading,
    error,
    refetch: fetchBoardMembers,
  };
}
