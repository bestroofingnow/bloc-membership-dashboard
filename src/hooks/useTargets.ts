'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { IndustryCategory, IndustryTarget } from '@/types';
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
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, session } = useAuth();
  const isConfigured = isSupabaseConfigured();

  const fetchTargets = useCallback(async () => {
    if (!isConfigured || !session) {
      return;
    }

    setLoading(true);
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
        const idMap: Record<string, string> = {};
        const transformedCategories = categoriesResult.data.map((cat) => {
          idMap[cat.name] = cat.id;
          const categoryTargets = (targetsResult.data || [])
            .filter((t) => t.category_id === cat.id)
            .map(transformDbToTarget);

          return {
            name: cat.name,
            targets: categoryTargets,
          };
        });

        setCategoryIds(idMap);
        setCategories(transformedCategories);
      }
      // If empty, keep static fallback data
    } catch (err) {
      console.error('Fetch targets error:', err);
      setError('Failed to load industry targets');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, session]);

  useEffect(() => {
    fetchTargets();

    if (!isConfigured || !session) return;

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
  }, [fetchTargets, isConfigured, session]);

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

  const addTarget = useCallback(
    async (
      categoryName: string,
      title: string,
      priority: 'high' | 'medium' | 'low'
    ): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setCategories((prev) =>
          prev.map((cat) =>
            cat.name === categoryName
              ? { ...cat, targets: [...cat.targets, { id: crypto.randomUUID(), title, priority }] }
              : cat
          )
        );
        return { error: null };
      }

      if (!canEdit) return { error: 'Permission denied' };

      const categoryId = categoryIds[categoryName];
      if (!categoryId) return { error: 'Category not found' };

      try {
        const { error: insertError } = await supabase
          .from('industry_targets')
          .insert([{ category_id: categoryId, title, priority }]);

        if (insertError) return { error: insertError.message };
        return { error: null };
      } catch {
        return { error: 'Failed to add target' };
      }
    },
    [isConfigured, canEdit, categoryIds]
  );

  const deleteTarget = useCallback(
    async (targetId: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            targets: cat.targets.filter((t) => t.id !== targetId),
          }))
        );
        return { error: null };
      }

      if (!canEdit) return { error: 'Permission denied' };

      try {
        const { error: deleteError } = await supabase
          .from('industry_targets')
          .delete()
          .eq('id', targetId);

        if (deleteError) return { error: deleteError.message };
        return { error: null };
      } catch {
        return { error: 'Failed to delete target' };
      }
    },
    [isConfigured, canEdit]
  );

  const addCategory = useCallback(
    async (name: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setCategories((prev) => [...prev, { name, targets: [] }]);
        return { error: null };
      }

      if (!canEdit) return { error: 'Permission denied' };

      try {
        const maxOrder = Math.max(0, ...Object.values(categoryIds).map(() => 0));
        const { error: insertError } = await supabase
          .from('industry_categories')
          .insert([{ name, display_order: maxOrder + 1 }]);

        if (insertError) return { error: insertError.message };
        await fetchTargets();
        return { error: null };
      } catch {
        return { error: 'Failed to add category' };
      }
    },
    [isConfigured, canEdit, categoryIds, fetchTargets]
  );

  const deleteCategory = useCallback(
    async (categoryName: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setCategories((prev) => prev.filter((c) => c.name !== categoryName));
        return { error: null };
      }

      if (!canEdit) return { error: 'Permission denied' };

      const categoryId = categoryIds[categoryName];
      if (!categoryId) return { error: 'Category not found' };

      try {
        const { error: deleteError } = await supabase
          .from('industry_categories')
          .delete()
          .eq('id', categoryId);

        if (deleteError) return { error: deleteError.message };
        await fetchTargets();
        return { error: null };
      } catch {
        return { error: 'Failed to delete category' };
      }
    },
    [isConfigured, canEdit, categoryIds, fetchTargets]
  );

  const clearError = () => setError(null);

  return {
    categories,
    loading,
    error,
    assignTarget,
    updateTargetNotes,
    addTarget,
    deleteTarget,
    addCategory,
    deleteCategory,
    totalTargets,
    assignedTargets,
    targetsByPriority,
    clearError,
    refetch: fetchTargets,
  };
}
