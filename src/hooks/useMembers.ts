'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Member, ChapterName } from '@/types';
import { members as staticMembers } from '@/data/members';
import { chooseInitialData, resolveFetchResult, isDemoMode } from '@/lib/demo-mode';
import { summarizeMembers } from '@/lib/members/summary';
import { directoryRowToMember, type DirectoryRow } from '@/lib/members/directory';
import { memberMatchesQuery } from '@/lib/members/search';

function transformDbToMember(row: any): Member {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    chapter: (row.chapter ?? null) as ChapterName | null,
    memberType: row.member_type === 'after_hours' ? 'after_hours' : 'full',
    industry: row.industry,
    email: row.email || undefined,
    phone: row.phone || undefined,
    title: row.title || undefined,
    website: row.website || undefined,
    description: row.description || undefined,
    address: row.address || undefined,
    mobilePhone: row.mobile_phone || undefined,
    birthday: row.birthday || undefined,
    memberSince: row.member_since || undefined,
    renewalDue: row.renewal_due || undefined,
    referredBy: row.referred_by || undefined,
  };
}

export function useMembers() {
  const isConfigured = isSupabaseConfigured();
  const isDemo = isDemoMode();
  const [members, setMembers] = useState<Member[]>(
    chooseInitialData(staticMembers, { isConfigured, isDemo })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, session } = useAuth();

  const fetchMembers = useCallback(async () => {
    if (!isConfigured || !session) {
      return;
    }

    setLoading(true);
    try {
      // STEP B: read the column-nulling member_directory view (migration 024)
      // instead of the raw members table. Same row count as members, so the
      // anti-fabrication guard (resolveFetchResult) still distinguishes a real
      // empty result from demo mode — personal columns just arrive NULL for
      // viewers who aren't the owner/staff and haven't been opted in.
      const { data, error: fetchError } = await supabase
        .from('member_directory')
        .select('*')
        .order('name', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching members:', fetchError);
      } else {
        const rows = (data ?? []).map((r) => directoryRowToMember(r as DirectoryRow));
        setMembers(resolveFetchResult(rows, staticMembers, { isConfigured, isDemo }));
      }
    } catch (err) {
      console.error('Fetch members error:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, isDemo, session]);

  useEffect(() => {
    fetchMembers();

    if (!isConfigured || !session) return;

    // Live updates for EVERYONE: any member add/edit/remove bumps the public
    // directory_version row (migration 029). Every logged-in client receives that
    // signal and refetches the privacy-projected member_directory. We listen to the
    // version signal rather than the members table, so this keeps working after the
    // members-table RLS tightening (027) — and no member PII is ever sent over the
    // realtime stream (only a version number), unlike a raw members-table feed.
    const channel = supabase
      .channel('directory-version')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'directory_version' },
        () => { fetchMembers(); },
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
          chapter: memberData.chapter ?? null,
          member_type: memberData.memberType ?? 'full',
          industry: memberData.industry,
          email: memberData.email || null,
          phone: memberData.phone || null,
          title: memberData.title || null,
          website: memberData.website || null,
          description: memberData.description || null,
          address: memberData.address || null,
          mobile_phone: memberData.mobilePhone || null,
          birthday: memberData.birthday || null,
          member_since: memberData.memberSince || null,
          renewal_due: memberData.renewalDue || null,
          referred_by: memberData.referredBy || null,
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
      if (updates.chapter !== undefined) dbUpdates.chapter = updates.chapter ?? null;
      if (updates.memberType !== undefined) dbUpdates.member_type = updates.memberType;
      if (updates.industry !== undefined) dbUpdates.industry = updates.industry;
      if (updates.email !== undefined) dbUpdates.email = updates.email || null;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone || null;
      if (updates.title !== undefined) dbUpdates.title = updates.title || null;
      if (updates.website !== undefined) dbUpdates.website = updates.website || null;
      if (updates.description !== undefined) dbUpdates.description = updates.description || null;
      if (updates.address !== undefined) dbUpdates.address = updates.address || null;
      if (updates.mobilePhone !== undefined) dbUpdates.mobile_phone = updates.mobilePhone || null;
      if (updates.birthday !== undefined) dbUpdates.birthday = updates.birthday || null;
      if (updates.memberSince !== undefined) dbUpdates.member_since = updates.memberSince || null;
      if (updates.renewalDue !== undefined) dbUpdates.renewal_due = updates.renewalDue || null;
      if (updates.referredBy !== undefined) dbUpdates.referred_by = updates.referredBy || null;

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
  const summary = useMemo(() => summarizeMembers(members), [members]);
  const chapterCounts = summary.chapterCounts;
  const fullMemberCount = summary.fullMemberCount;
  const afterHoursCount = summary.afterHoursCount;

  const membersByChapter = useMemo(() => {
    const result: Record<ChapterName, Member[]> = {
      North: [], South: [], Uptown: [], FLOC: [], Alumni: [],
    };
    members.forEach((m) => {
      if (m.memberType !== 'after_hours' && m.chapter && result[m.chapter]) {
        result[m.chapter].push(m);
      }
    });
    return result;
  }, [members]);

  const searchMembers = useCallback(
    (query: string): Member[] => members.filter((m) => memberMatchesQuery(m, query)),
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
    fullMemberCount,
    afterHoursCount,
    searchMembers,
    getMembersByChapter,
    addMember,
    updateMember,
    deleteMember,
    clearError,
    refetch: fetchMembers,
  };
}
