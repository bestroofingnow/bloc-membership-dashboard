'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type UserRole = 'admin' | 'chapter_director' | 'member';
export type ChapterName = 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  chapter: ChapterName | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isDirector: boolean;
  canEdit: boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  const fetchProfile = useCallback(async (userId: string) => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        setError('Failed to load user profile');
      } else if (data) {
        setProfile({
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          role: data.role as UserRole,
          chapter: data.chapter as ChapterName | null,
        });
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (event === 'SIGNED_IN' && currentSession?.user) {
          await fetchProfile(currentSession.user.id);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [isConfigured, fetchProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!isConfigured) {
      return { error: 'Supabase is not configured' };
    }

    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return { error: signInError.message };
      }

      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      setLoading(false);
      return { error: message };
    }
  };

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
    if (!isConfigured) {
      return { error: 'Supabase is not configured' };
    }

    setError(null);
    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return { error: signUpError.message };
      }

      setLoading(false);
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      setLoading(false);
      return { error: message };
    }
  };

  const signOut = async () => {
    if (!isConfigured) return;

    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  const clearError = () => setError(null);

  const isAdmin = profile?.role === 'admin';
  const isDirector = profile?.role === 'chapter_director';
  const canEdit = !isConfigured || isAdmin || isDirector;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        error,
        isConfigured,
        signIn,
        signUp,
        signOut,
        isAdmin,
        isDirector,
        canEdit,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
