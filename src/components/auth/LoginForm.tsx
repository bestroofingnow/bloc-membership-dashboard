'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from '@/lib/auth/password';

interface LoginFormProps {
  onSuccess?: () => void;
}

type Mode = 'signin' | 'reset' | 'magic';

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn, requestPasswordReset, signInWithMagicLink, error: authError, clearError, isConfigured } = useAuth();
  const isReset = mode === 'reset';
  const isMagic = mode === 'magic';
  const isPasswordless = isReset || isMagic;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    if (isPasswordless) {
      if (!email) {
        setLocalError('Please enter your email');
        return;
      }
      setIsSubmitting(true);
      const { error } = isMagic
        ? await signInWithMagicLink(email)
        : await requestPasswordReset(email);
      if (error) {
        setLocalError(error);
      } else {
        setSuccessMessage(
          isMagic
            ? `If an account exists for ${email}, a one-time sign-in link has been sent. Click it on this device to log in.`
            : `If an account exists for ${email}, a password reset link has been sent. Check your inbox (and spam folder).`,
        );
      }
      setIsSubmitting(false);
      return;
    }

    if (!email || !password) {
      setLocalError('Please fill in all required fields');
      return;
    }

    if (!validatePasswordLength(password)) {
      setLocalError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    if (!error && onSuccess) {
      onSuccess();
    }
    setIsSubmitting(false);
  };

  function switchMode(next: Mode) {
    setMode(next);
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
  }

  const error = localError || authError;

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-bloc-navy">BLOC Dashboard</h2>
            <p className="mt-2 text-gray-600">Demo Mode</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800">Supabase Not Configured</h3>
                <p className="text-sm text-amber-700 mt-1">
                  The dashboard is running in demo mode. Data will not persist across sessions.
                  To enable full functionality, configure your Supabase environment variables.
                </p>
              </div>
            </div>
          </div>
          <Button onClick={onSuccess} className="w-full">
            Continue in Demo Mode
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-bloc-navy rounded-full flex items-center justify-center">
              <span className="text-white text-2xl font-bold">B</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-bloc-navy">BLOC Dashboard</h2>
          <p className="mt-2 text-gray-600">
            {isReset
              ? 'Reset your password'
              : isMagic
                ? 'Sign in with a one-time email link'
                : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {!isPasswordless && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isMagic ? 'Sending link…' : isReset ? 'Sending…' : 'Signing In...'}
              </>
            ) : (
              isMagic ? 'Email me a sign-in link' : isReset ? 'Send reset link' : 'Sign In'
            )}
          </Button>

          <div className="text-center space-y-2">
            {mode === 'signin' && (
              <>
                <div>
                  <button
                    type="button"
                    onClick={() => switchMode('magic')}
                    className="text-sm text-bloc-blue hover:text-bloc-navy"
                  >
                    Sign in with an email link instead
                  </button>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-sm text-bloc-blue hover:text-bloc-navy"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}
            <div>
              {isPasswordless ? (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-sm text-bloc-blue hover:text-bloc-navy"
                >
                  Back to sign in
                </button>
              ) : (
                <a
                  href="/join"
                  className="text-sm text-bloc-blue hover:text-bloc-navy"
                >
                  Not a member yet? Apply to join
                </a>
              )}
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-gray-500">
          Business Leaders of Charlotte Member Portal
        </p>
      </div>
    </div>
  );
}
