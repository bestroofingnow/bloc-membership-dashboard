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
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  isDeactivated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
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
  const [isDeactivated, setIsDeactivated] = useState(false);
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
        .maybeSingle();

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
          mustChangePassword: data.must_change_password ?? false,
        });
        setIsDeactivated(false);
      } else {
        // User is authenticated but has no profile — account was deactivated
        setProfile(null);
        setIsDeactivated(true);
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

    // Safety timeout — never stay stuck loading for more than 8 seconds
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 8000);

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Failed to get session:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && currentSession?.user) {
          await fetchProfile(currentSession.user.id);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
        } else if (!currentSession) {
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
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

  const changePassword = async (newPassword: string): Promise<{ error: string | null }> => {
    if (!isConfigured) {
      return { error: 'Supabase is not configured' };
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        return { error: updateError.message };
      }

      // Clear the must_change_password flag in the profile
      if (user) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id);

        // Update local state
        setProfile(prev => prev ? { ...prev, mustChangePassword: false } : prev);
      }

      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
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
        isDeactivated,
        signIn,
        signUp,
        signOut,
        changePassword,
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
