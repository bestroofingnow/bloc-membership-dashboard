'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ChapterName } from '@/types';

export interface MyMember {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  email: string | null;
  phone: string | null;
  category_id: string | null;
  category_title: string | null;
}

export interface MyVisibility {
  chapter: ChapterName;
  visible: boolean;
  public_business_name: string | null;
  public_category_id: string | null;
  has_override_row: boolean;
}

export function useMyMember() {
  const { profile, session } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [member, setMember] = useState<MyMember | null>(null);
  const [visibilities, setVisibilities] = useState<MyVisibility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session || !profile?.email) {
      setMember(null);
      setVisibilities([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const email = profile.email.toLowerCase();
      const { data: rows, error: mErr } = await supabase
        .from('members')
        .select('id,name,company,chapter,email,phone,category_id')
        .ilike('email', email)
        .limit(1);
      if (mErr) {
        setError(mErr.message);
        setMember(null);
        return;
      }
      const m = (rows ?? [])[0] as {
        id: string; name: string; company: string; chapter: ChapterName;
        email: string | null; phone: string | null; category_id: string | null;
      } | undefined;
      if (!m) {
        setMember(null);
        setVisibilities([]);
        return;
      }
      let category_title: string | null = null;
      if (m.category_id) {
        const { data: cat } = await supabase
          .from('industry_targets')
          .select('title')
          .eq('id', m.category_id)
          .maybeSingle();
        category_title = (cat as { title: string } | null)?.title ?? null;
      }
      setMember({ ...m, category_title });

      const { data: visRows } = await supabase
        .from('chapter_member_visibility')
        .select('chapter,visible,public_business_name,public_category_id')
        .eq('member_id', m.id);
      const visMap = new Map<ChapterName, MyVisibility>();
      for (const v of (visRows ?? []) as Array<{ chapter: ChapterName; visible: boolean; public_business_name: string | null; public_category_id: string | null }>) {
        visMap.set(v.chapter, { ...v, has_override_row: true });
      }
      // Member visibility currently scopes to their own primary chapter.
      // Cross-chapter rows would be added if a member is featured in multiple chapters.
      const chaptersToShow: ChapterName[] = [m.chapter];
      const result: MyVisibility[] = chaptersToShow.map((ch) => {
        return visMap.get(ch) ?? {
          chapter: ch,
          visible: true,
          public_business_name: null,
          public_category_id: null,
          has_override_row: false,
        };
      });
      setVisibilities(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, profile?.email]);

  useEffect(() => { load(); }, [load]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const setMyVisibility = useCallback(async (
    chapter: ChapterName,
    visible: boolean,
    overrides?: { public_business_name?: string | null; public_category_id?: string | null },
  ) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/me/roster-visibility`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chapter,
        visible,
        public_business_name: overrides?.public_business_name ?? null,
        public_category_id: overrides?.public_category_id ?? null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `update_failed_${res.status}`);
    }
    await load();
  }, [authHeaders, load]);

  return { member, visibilities, loading, error, refresh: load, setMyVisibility };
}
