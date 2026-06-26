'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Guest, GuestStatus } from '@/types';
import { initialGuests, getNextStatus, getNextStepText } from '@/data/guests';
import { chooseInitialData, resolveFetchResult, isDemoMode } from '@/lib/demo-mode';

// Transform database row to app Guest type
function transformDbToGuest(row: any): Guest {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    industry: row.industry || '',
    invitedBy: row.invited_by,
    email: row.email || '',
    phone: row.phone || '',
    status: row.status as GuestStatus,
    nextStep: row.next_step,
    notes: row.notes || '',
    convertedMemberId: row.converted_member_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Transform app Guest type to database format
function transformGuestToDb(guest: Partial<Guest>): any {
  const result: any = {};
  if (guest.name !== undefined) result.name = guest.name;
  if (guest.company !== undefined) result.company = guest.company;
  if (guest.industry !== undefined) result.industry = guest.industry || null;
  if (guest.invitedBy !== undefined) result.invited_by = guest.invitedBy;
  if (guest.email !== undefined) result.email = guest.email || null;
  if (guest.phone !== undefined) result.phone = guest.phone || null;
  if (guest.status !== undefined) result.status = guest.status;
  if (guest.nextStep !== undefined) result.next_step = guest.nextStep;
  if (guest.notes !== undefined) result.notes = guest.notes || null;
  return result;
}

export function useGuests() {
  const isConfigured = isSupabaseConfigured();
  const isDemo = isDemoMode();
  const [guests, setGuests] = useState<Guest[]>(
    chooseInitialData(initialGuests, { isConfigured, isDemo })
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, session } = useAuth();

  const fetchGuests = useCallback(async () => {
    if (!isConfigured || !session) {
      return;
    }

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('guests')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        console.error('Error fetching guests:', fetchError);
      } else {
        const rows = (data ?? []).map(transformDbToGuest);
        setGuests(resolveFetchResult(rows, initialGuests, { isConfigured, isDemo }));
      }
    } catch (err) {
      console.error('Fetch guests error:', err);
      setError('Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, [isConfigured, isDemo, session]);

  useEffect(() => {
    fetchGuests();

    if (!isConfigured || !session) return;

    // Set up realtime subscription
    const channel = supabase
      .channel('guests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newGuest = transformDbToGuest(payload.new);
            setGuests((prev) => [newGuest, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedGuest = transformDbToGuest(payload.new);
            setGuests((prev) =>
              prev.map((g) => (g.id === updatedGuest.id ? updatedGuest : g))
            );
          } else if (payload.eventType === 'DELETE') {
            setGuests((prev) => prev.filter((g) => g.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGuests, isConfigured, session]);

  const addGuest = async (
    guestData: Omit<Guest, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'nextStep'>
  ): Promise<Guest | null> => {
    const newGuest: Guest = {
      ...guestData,
      id: crypto.randomUUID(),
      status: 'New Lead',
      nextStep: getNextStepText('New Lead'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!isConfigured) {
      // Demo mode - just update local state
      setGuests((prev) => [newGuest, ...prev]);
      return newGuest;
    }

    if (!canEdit) {
      setError('You do not have permission to add guests');
      return null;
    }

    try {
      const { data, error: insertError } = await supabase
        .from('guests')
        .insert([transformGuestToDb(newGuest)])
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return null;
      }

      // Update local state immediately for better UX
      if (data) {
        const createdGuest = transformDbToGuest(data);
        setGuests((prev) => [createdGuest, ...prev]);
        return createdGuest;
      }

      return newGuest;
    } catch (err) {
      setError('Failed to add guest');
      return null;
    }
  };

  const updateGuest = async (
    id: string,
    updates: Partial<Guest>
  ): Promise<Guest | null> => {
    if (!isConfigured) {
      // Demo mode
      setGuests((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g
        )
      );
      return guests.find((g) => g.id === id) || null;
    }

    if (!canEdit) {
      setError('You do not have permission to update guests');
      return null;
    }

    try {
      const { data, error: updateError } = await supabase
        .from('guests')
        .update(transformGuestToDb(updates))
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        setError(updateError.message);
        return null;
      }

      // Update local state immediately for better UX
      if (data) {
        const updatedGuest = transformDbToGuest(data);
        setGuests((prev) =>
          prev.map((g) => (g.id === updatedGuest.id ? updatedGuest : g))
        );
        return updatedGuest;
      }

      return null;
    } catch (err) {
      setError('Failed to update guest');
      return null;
    }
  };

  const advanceGuest = async (id: string): Promise<Guest | null> => {
    const guest = guests.find((g) => g.id === id);
    if (!guest) return null;

    const nextStatus = getNextStatus(guest.status);
    if (!nextStatus) return guest; // Already at final status

    return updateGuest(id, {
      status: nextStatus,
      nextStep: getNextStepText(nextStatus),
    });
  };

  const deleteGuest = async (id: string): Promise<boolean> => {
    if (!isConfigured) {
      // Demo mode
      setGuests((prev) => prev.filter((g) => g.id !== id));
      return true;
    }

    if (!canEdit) {
      setError('You do not have permission to delete guests');
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from('guests')
        .delete()
        .eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      // Update local state immediately
      setGuests((prev) => prev.filter((g) => g.id !== id));
      return true;
    } catch (err) {
      setError('Failed to delete guest');
      return false;
    }
  };

  const clearError = () => setError(null);

  return {
    guests,
    loading,
    error,
    addGuest,
    updateGuest,
    advanceGuest,
    deleteGuest,
    refetch: fetchGuests,
    clearError,
  };
}
