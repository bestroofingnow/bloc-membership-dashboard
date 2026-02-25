'use client';

import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from './LoginForm';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading, isConfigured } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-bloc-blue mx-auto" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If Supabase is not configured, allow access (demo mode)
  if (!isConfigured) {
    return <>{children}</>;
  }

  // If not authenticated, show login form
  if (!user) {
    return fallback ? <>{fallback}</> : <LoginForm />;
  }

  // User is authenticated
  return <>{children}</>;
}
