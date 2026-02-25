'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { IndustryCategory, IndustryTarget, ChapterName } from '@/types';
import { industryTargets as staticTargets } from '@/data/targets';

interface DbIndustryCategory {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

interface DbIndustryTarget {
  id: string;
  category_id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function transformDbToTarget(row: DbIndustryTarget): IndustryTarget {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    assignedTo: row.assigned_to || undefined,
    notes: row.notes || undefined,
  };
}

export function useTargets() {
  const [categories, setCategories] = useState<IndustryCategory[]>(staticTargets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchTargets = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      // Fetch categories and targets in parallel
      const [categoriesResult, targetsResult] = await Promise.all([
        supabase
          .from('industry_categories')
          .select('*')
          .order('display_order', { ascending: true }),
        supabase
          .from('industry_targets')
          .select('*')
          .order('priority', { ascending: true }),
      ]);

      if (categoriesResult.error) {
        setError(categoriesResult.error.message);
        console.error('Error fetching categories:', categoriesResult.error);
        return;
      }

      if (targetsResult.error) {
        setError(targetsResult.error.message);
        console.error('Error fetching targets:', targetsResult.error);
        return;
      }

      if (categoriesResult.data && categoriesResult.data.length > 0) {
        const transformedCategories = categoriesResult.data.map((cat) => {
          const categoryTargets = (targetsResult.data || [])
            .filter((t) => t.category_id === cat.id)
            .map(transformDbToTarget);

          return {
            name: cat.name,
            targets: categoryTargets,
          };
        });

        setCategories(transformedCategories);
      }
    } catch (err) {
      console.error('Fetch targets error:', err);
      setError('Failed to load industry targets');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchTargets();

    if (!isConfigured) return;

    // Set up realtime subscription for targets
    const channel = supabase
      .channel('targets-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'industry_targets' },
        () => {
          // Refetch all data on any change for simplicity
          fetchTargets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTargets, isConfigured]);

  // Assign a target to a user
  const assignTarget = useCallback(
    async (targetId: string, assignedTo: string | null): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        // Demo mode - update local state
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            targets: cat.targets.map((t) =>
              t.id === targetId ? { ...t, assignedTo: assignedTo || undefined } : t
            ),
          }))
        );
        return { error: null };
      }

      try {
        const { error: updateError } = await supabase
          .from('industry_targets')
          .update({ assigned_to: assignedTo })
          .eq('id', targetId);

        if (updateError) {
          console.error('Error assigning target:', updateError);
          return { error: updateError.message };
        }

        return { error: null };
      } catch (err) {
        console.error('Assign target error:', err);
        return { error: 'Failed to assign target' };
      }
    },
    [isConfigured]
  );

  // Update target notes
  const updateTargetNotes = useCallback(
    async (targetId: string, notes: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        // Demo mode - update local state
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            targets: cat.targets.map((t) =>
              t.id === targetId ? { ...t, notes: notes || undefined } : t
            ),
          }))
        );
        return { error: null };
      }

      try {
        const { error: updateError } = await supabase
          .from('industry_targets')
          .update({ notes })
          .eq('id', targetId);

        if (updateError) {
          console.error('Error updating target notes:', updateError);
          return { error: updateError.message };
        }

        return { error: null };
      } catch (err) {
        console.error('Update target notes error:', err);
        return { error: 'Failed to update notes' };
      }
    },
    [isConfigured]
  );

  // Computed values
  const totalTargets = useMemo(() => {
    return categories.reduce((sum, cat) => sum + cat.targets.length, 0);
  }, [categories]);

  const assignedTargets = useMemo(() => {
    return categories.reduce(
      (sum, cat) => sum + cat.targets.filter((t) => t.assignedTo).length,
      0
    );
  }, [categories]);

  const targetsByPriority = useMemo(() => {
    const all = categories.flatMap((cat) => cat.targets);
    return {
      high: all.filter((t) => t.priority === 'high'),
      medium: all.filter((t) => t.priority === 'medium'),
      low: all.filter((t) => t.priority === 'low'),
    };
  }, [categories]);

  return {
    categories,
    loading,
    error,
    assignTarget,
    updateTargetNotes,
    totalTargets,
    assignedTargets,
    targetsByPriority,
    refetch: fetchTargets,
  };
}
