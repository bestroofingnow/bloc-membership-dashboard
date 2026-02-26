'use client';

import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from './LoginForm';
import { Loader2, ShieldOff } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading, isConfigured, isDeactivated, signOut } = useAuth();

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

  // User is authenticated but their profile was removed (deactivated)
  if (isDeactivated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
          <ShieldOff size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account Deactivated</h2>
          <p className="text-slate-600 mb-6">
            Your dashboard access has been revoked by an administrator.
            Contact your BLOC admin if you believe this is an error.
          </p>
          <button
            onClick={signOut}
            className="px-6 py-2.5 bg-bloc-blue text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // User is authenticated
  return <>{children}</>;
}
