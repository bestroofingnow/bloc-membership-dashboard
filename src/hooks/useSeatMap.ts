'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ChapterName, SeatRow } from '@/types';

interface IndustryRow { id: string; name: string }
interface CategoryRow { id: string; category_id: string; title: string }
interface MemberRow {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  industry_id: string | null;
  category_id: string | null;
}

/**
 * Compute the seat-occupancy table for a chapter: every (industry, category)
 * combination paired with the members who currently hold it.
 *
 * "open" = no members hold this category seat in this chapter
 * "occupied" = exactly 1 member holds
 * "multi" = 2+ members hold (likely needs cleanup)
 */
export function useSeatMap(chapter: ChapterName | null) {
  const { session, isAdmin, isDirector } = useAuth();
  const isConfigured = isSupabaseConfigured();
  const canManage = isAdmin || isDirector;

  const [industries, setIndustries] = useState<IndustryRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured || !session || !canManage || !chapter) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: inds, error: iErr }, { data: cats, error: cErr }, { data: mems, error: mErr }] = await Promise.all([
        supabase.from('industry_categories').select('id,name').order('name'),
        supabase.from('industry_targets').select('id,category_id,title').order('title'),
        supabase
          .from('members')
          .select('id,name,company,chapter,industry_id,category_id')
          .eq('chapter', chapter),
      ]);
      if (iErr || cErr || mErr) {
        setError((iErr ?? cErr ?? mErr)!.message);
        return;
      }
      setIndustries((inds ?? []) as IndustryRow[]);
      setCategories((cats ?? []) as CategoryRow[]);
      setMembers((mems ?? []) as MemberRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session, canManage, chapter]);

  useEffect(() => { load(); }, [load]);

  const seats: SeatRow[] = useMemo(() => {
    const indById = new Map(industries.map((i) => [i.id, i]));
    return categories
      .map((c) => {
        const ind = indById.get(c.category_id);
        if (!ind) return null;
        const occupants = members
          .filter((m) => m.category_id === c.id)
          .map((m) => ({ member_id: m.id, member_name: m.name, member_company: m.company }));
        const status: SeatRow['status'] =
          occupants.length === 0 ? 'open' :
          occupants.length === 1 ? 'occupied' : 'multi';
        return {
          industry_id: ind.id,
          industry_name: ind.name,
          category_id: c.id,
          category_title: c.title,
          occupants,
          status,
        } as SeatRow;
      })
      .filter((r): r is SeatRow => r !== null)
      .sort((a, b) => {
        const byInd = a.industry_name.localeCompare(b.industry_name);
        if (byInd !== 0) return byInd;
        return a.category_title.localeCompare(b.category_title);
      });
  }, [industries, categories, members]);

  const stats = useMemo(() => {
    const open = seats.filter((s) => s.status === 'open').length;
    const occupied = seats.filter((s) => s.status === 'occupied').length;
    const multi = seats.filter((s) => s.status === 'multi').length;
    return { total: seats.length, open, occupied, multi };
  }, [seats]);

  return { seats, stats, loading, error, refresh: load };
}
