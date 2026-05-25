'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ChapterName, RosterMember } from '@/types';

export interface RosterUpsertInput {
  member_id: string;
  chapter: ChapterName;
  visible: boolean;
  public_business_name?: string | null;
  public_category_id?: string | null;
}

interface MemberRow {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  category_id: string | null;
}

interface VisibilityRow {
  member_id: string;
  chapter: ChapterName;
  visible: boolean;
  public_business_name: string | null;
  public_category_id: string | null;
}

interface CategoryRow { id: string; title: string }

export function useChapterRoster(chapter: ChapterName | null) {
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, isAdmin, isDirector } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const canManage = isAdmin || isDirector;

  const fetchRoster = useCallback(async () => {
    if (!isConfigured || !session || !canManage || !chapter) {
      setRoster([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: members, error: mErr }, { data: visRows, error: vErr }] = await Promise.all([
        supabase
          .from('members')
          .select('id,name,company,chapter,category_id')
          .eq('chapter', chapter)
          .order('name', { ascending: true }),
        supabase
          .from('chapter_member_visibility')
          .select('member_id,chapter,visible,public_business_name,public_category_id')
          .eq('chapter', chapter),
      ]);
      if (mErr || vErr) {
        setError((mErr ?? vErr)!.message);
        setRoster([]);
        return;
      }

      const memberRows = (members ?? []) as MemberRow[];
      const visMap = new Map<string, VisibilityRow>();
      for (const v of (visRows ?? []) as VisibilityRow[]) visMap.set(v.member_id, v);

      // Batch-load category titles for member + override category ids
      const catIds = Array.from(new Set(
        memberRows.flatMap((m) => [m.category_id, visMap.get(m.id)?.public_category_id]).filter(Boolean) as string[]
      ));
      const catTitles = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await supabase.from('industry_targets').select('id,title').in('id', catIds);
        for (const c of (cats ?? []) as CategoryRow[]) catTitles.set(c.id, c.title);
      }

      const result: RosterMember[] = memberRows.map((m) => {
        const v = visMap.get(m.id);
        return {
          member_id: m.id,
          member_name: m.name,
          member_company: m.company,
          member_chapter: m.chapter,
          member_category_id: m.category_id,
          member_category_title: m.category_id ? catTitles.get(m.category_id) ?? null : null,
          visible: v ? v.visible : true,
          public_business_name: v?.public_business_name ?? null,
          public_category_id: v?.public_category_id ?? null,
          public_category_title: v?.public_category_id ? catTitles.get(v.public_category_id) ?? null : null,
          has_override_row: !!v,
        };
      });
      setRoster(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, canManage, chapter]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  useEffect(() => {
    if (!isConfigured || !session || !canManage) return;
    const ch = supabase
      .channel('roster-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chapter_member_visibility' }, () => fetchRoster())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isConfigured, session, canManage, fetchRoster]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const upsertVisibility = useCallback(async (input: RosterUpsertInput) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch('/api/admin/chapter-visibility', { method: 'POST', headers, body: JSON.stringify(input) });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `upsert_failed_${res.status}`);
    }
  }, [authHeaders]);

  const clearOverride = useCallback(async (member_id: string, chap: ChapterName) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/admin/chapter-visibility?member_id=${member_id}&chapter=${chap}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `clear_failed_${res.status}`);
    }
  }, [authHeaders]);

  return { roster, loading, error, canManage, refresh: fetchRoster, upsertVisibility, clearOverride };
}
