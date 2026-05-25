'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { suggestTaxonomy } from '@/lib/taxonomy/suggest';
import type { ChapterName, MemberTaxonomyRow } from '@/types';

interface MemberRow {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  industry: string | null;
  industry_id: string | null;
  category_id: string | null;
}

interface IndustryRow { id: string; name: string }
interface CategoryRow { id: string; category_id: string; title: string }

export function useMemberTaxonomyAdmin() {
  const { session, isAdmin } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const [rows, setRows] = useState<MemberTaxonomyRow[]>([]);
  const [industries, setIndustries] = useState<IndustryRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session || !isAdmin) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: mems, error: mErr }, { data: inds, error: iErr }, { data: cats, error: cErr }] = await Promise.all([
        supabase
          .from('members')
          .select('id,name,company,chapter,industry,industry_id,category_id')
          .order('name', { ascending: true }),
        supabase.from('industry_categories').select('id,name').order('name'),
        supabase.from('industry_targets').select('id,category_id,title').order('title'),
      ]);
      if (mErr || iErr || cErr) {
        setError((mErr ?? iErr ?? cErr)!.message);
        return;
      }
      const memberRows = (mems ?? []) as MemberRow[];
      const indRows = (inds ?? []) as IndustryRow[];
      const catRows = (cats ?? []) as CategoryRow[];
      setIndustries(indRows);
      setCategories(catRows);

      const indById = new Map<string, IndustryRow>();
      for (const i of indRows) indById.set(i.id, i);
      const catById = new Map<string, CategoryRow>();
      for (const c of catRows) catById.set(c.id, c);

      const result: MemberTaxonomyRow[] = memberRows.map((m) => {
        const legacy = m.industry ?? null;
        const suggestion = !m.industry_id
          ? suggestTaxonomy(legacy, indRows, catRows)
          : { industry_id: null, industry_name: null, category_id: null, category_title: null };
        const currInd = m.industry_id ? indById.get(m.industry_id) ?? null : null;
        const currCat = m.category_id ? catById.get(m.category_id) ?? null : null;

        return {
          member_id: m.id,
          name: m.name,
          company: m.company,
          chapter: m.chapter,
          legacy_industry_text: legacy,
          current_industry_id: m.industry_id,
          current_industry_name: currInd?.name ?? null,
          current_category_id: m.category_id,
          current_category_title: currCat?.title ?? null,
          suggested_industry_id: suggestion.industry_id,
          suggested_industry_name: suggestion.industry_name,
          suggested_category_id: suggestion.category_id,
          suggested_category_title: suggestion.category_title,
        };
      });
      setRows(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const setMemberTaxonomy = useCallback(async (
    memberId: string,
    industry_id: string | null,
    category_id: string | null,
  ) => {
    const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
    const res = await fetch(`/api/admin/members/${memberId}/taxonomy`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ industry_id, category_id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `update_failed_${res.status}`);
    }
  }, [authHeaders]);

  const stats = useMemo(() => {
    const total = rows.length;
    const assigned = rows.filter((r) => r.current_industry_id).length;
    const unassigned = total - assigned;
    const suggestions = rows.filter((r) => !r.current_industry_id && r.suggested_industry_id).length;
    return { total, assigned, unassigned, suggestions };
  }, [rows]);

  return {
    rows,
    industries,
    categories,
    loading,
    error,
    stats,
    refresh: load,
    setMemberTaxonomy,
  };
}
