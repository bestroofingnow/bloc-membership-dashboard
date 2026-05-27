'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Password reset callback. Supabase recovery emails redirect here with a
 * URL-fragment session that the Supabase client picks up automatically.
 * We wait until that session is present, then let the user set a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'waiting' | 'ready' | 'saving' | 'done' | 'no-session'>('waiting');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPhase('no-session');
      return;
    }
    // Supabase fires PASSWORD_RECOVERY when the recovery hash is consumed.
    // It also restores any existing session on mount; check both paths.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setPhase('ready');
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPhase('ready');
      else setTimeout(() => setPhase((p) => (p === 'waiting' ? 'no-session' : p)), 3000);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setPhase('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setPhase('ready');
      return;
    }
    // Clear must_change_password if set (covers the legacy temp-password path).
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', userData.user.id);
    }
    setPhase('done');
    setTimeout(() => router.replace('/'), 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-bloc-navy rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-bloc-navy">Set a new password</h2>
        </div>

        {phase === 'waiting' && (
          <div className="rounded-lg border bg-white p-6 text-center text-gray-600">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Verifying your reset link…
          </div>
        )}

        {phase === 'no-session' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
            <div className="flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium">This reset link is invalid or expired.</p>
                <p>Reset links are good for 1 hour. Request a fresh one from the sign-in page.</p>
                <Link href="/" className="inline-block underline">Back to sign in</Link>
              </div>
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'saving') && (
          <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 space-y-4">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-3 flex gap-2 items-center text-red-700 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium text-gray-700 block mb-1">New password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  autoFocus
                  required
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 block mb-1">Confirm password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={phase === 'saving'}
              className="w-full flex items-center justify-center px-4 py-2 bg-bloc-blue text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {phase === 'saving' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating…</>
              ) : (
                'Update password'
              )}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-800 text-center">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="font-medium">Password updated. Redirecting to your dashboard…</p>
          </div>
        )}
      </div>
    </main>
  );
}
