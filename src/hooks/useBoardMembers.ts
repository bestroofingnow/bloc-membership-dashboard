'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { BoardMember } from '@/types';
import { boardMembers as staticBoard } from '@/data/board';

export interface BoardMemberWithId extends BoardMember {
  id?: string;
}

function transformDbToBoardMember(row: any): BoardMemberWithId {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
  };
}

export function useBoardMembers() {
  const [boardMembers, setBoardMembers] = useState<BoardMemberWithId[]>(staticBoard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, session } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchBoardMembers = useCallback(async () => {
    if (!isConfigured || !session) {
      return;
    }

    setLoading(true);
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
      // If empty, keep static fallback data
    } catch (err) {
      console.error('Fetch board members error:', err);
      setError('Failed to load board members');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    fetchBoardMembers();

    if (!isConfigured || !session) return;

    const channel = supabase
      .channel('board-members-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_members' },
        () => {
          fetchBoardMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBoardMembers, isConfigured, session]);

  const addBoardMember = async (
    memberData: BoardMember
  ): Promise<boolean> => {
    if (!isConfigured) {
      setBoardMembers((prev) => [...prev, memberData]);
      return true;
    }

    if (!canEdit) {
      setError('You do not have permission to add board members');
      return false;
    }

    try {
      const { error: insertError } = await supabase
        .from('board_members')
        .insert([{
          role: memberData.role,
          name: memberData.name,
          company: memberData.company,
          email: memberData.email,
          phone: memberData.phone,
        }]);

      if (insertError) {
        setError(insertError.message);
        return false;
      }

      return true;
    } catch (err) {
      setError('Failed to add board member');
      return false;
    }
  };

  const updateBoardMember = async (
    id: string,
    updates: Partial<BoardMember>
  ): Promise<boolean> => {
    if (!isConfigured) {
      setBoardMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
      return true;
    }

    if (!canEdit) {
      setError('You do not have permission to update board members');
      return false;
    }

    try {
      const dbUpdates: any = {};
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.company !== undefined) dbUpdates.company = updates.company;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;

      const { error: updateError } = await supabase
        .from('board_members')
        .update(dbUpdates)
        .eq('id', id);

      if (updateError) {
        setError(updateError.message);
        return false;
      }

      return true;
    } catch (err) {
      setError('Failed to update board member');
      return false;
    }
  };

  const deleteBoardMember = async (id: string): Promise<boolean> => {
    if (!isConfigured) {
      setBoardMembers((prev) => prev.filter((m) => m.id !== id));
      return true;
    }

    if (!canEdit) {
      setError('You do not have permission to delete board members');
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from('board_members')
        .delete()
        .eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      return true;
    } catch (err) {
      setError('Failed to delete board member');
      return false;
    }
  };

  // Group board members by role for display
  const boardByRole = boardMembers.reduce((acc, member) => {
    if (!acc[member.role]) {
      acc[member.role] = [];
    }
    acc[member.role].push(member);
    return acc;
  }, {} as Record<string, BoardMemberWithId[]>);

  const clearError = () => setError(null);

  return {
    boardMembers,
    boardByRole,
    loading,
    error,
    addBoardMember,
    updateBoardMember,
    deleteBoardMember,
    clearError,
    refetch: fetchBoardMembers,
  };
}
