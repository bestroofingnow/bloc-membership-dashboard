'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getNextStepText } from '@/data/guests';

export interface PublicSignup {
  id: string;
  name: string;
  company: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  referralSource: string | null;
  notes: string | null;
  processed: boolean;
  createdAt: string;
}

function transformDbToSignup(row: any): PublicSignup {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    industry: row.industry,
    email: row.email,
    phone: row.phone,
    referralSource: row.referral_source,
    notes: row.notes,
    processed: row.processed,
    createdAt: row.created_at,
  };
}

export function useSignups() {
  const [signups, setSignups] = useState<PublicSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchSignups = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('public_signups')
        .select('*')
        .eq('processed', false)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setSignups(data.map(transformDbToSignup));
      }
    } catch (err) {
      setError('Failed to load signups');
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    fetchSignups();

    if (!isConfigured) return;

    const channel = supabase
      .channel('signups-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_signups' },
        () => {
          fetchSignups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSignups, isConfigured]);

  const promoteToGuest = async (signupId: string): Promise<{ error: string | null }> => {
    if (!isConfigured) return { error: 'Not configured' };

    const signup = signups.find((s) => s.id === signupId);
    if (!signup) return { error: 'Signup not found' };

    try {
      // Create a guest in the pipeline
      const { error: insertError } = await supabase.from('guests').insert([
        {
          name: signup.name,
          company: signup.company,
          industry: signup.industry,
          email: signup.email,
          phone: signup.phone,
          invited_by: signup.referralSource || 'Website Form',
          status: 'New Lead',
          next_step: getNextStepText('New Lead'),
          notes: signup.notes,
        },
      ]);

      if (insertError) {
        return { error: insertError.message };
      }

      // Mark signup as processed
      const { error: updateError } = await supabase
        .from('public_signups')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', signupId);

      if (updateError) {
        return { error: updateError.message };
      }

      return { error: null };
    } catch (err) {
      return { error: 'Failed to promote signup' };
    }
  };

  const dismissSignup = async (signupId: string): Promise<{ error: string | null }> => {
    if (!isConfigured) return { error: 'Not configured' };

    try {
      const { error: updateError } = await supabase
        .from('public_signups')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', signupId);

      if (updateError) {
        return { error: updateError.message };
      }

      return { error: null };
    } catch (err) {
      return { error: 'Failed to dismiss signup' };
    }
  };

  return {
    signups,
    loading,
    error,
    promoteToGuest,
    dismissSignup,
    refetch: fetchSignups,
  };
}
