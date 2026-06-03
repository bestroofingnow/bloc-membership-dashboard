'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { PASSWORD_MIN_LENGTH, validatePasswordLength } from '@/lib/auth/password';

export function ChangePasswordModal() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { changePassword, profile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validatePasswordLength(newPassword)) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    const { error: changeError } = await changePassword(newPassword);
    if (changeError) {
      setError(changeError);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-bloc-navy rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-bloc-navy">Set a New Password</h2>
          <p className="mt-2 text-gray-600">
            {profile?.fullName ? `Hi ${profile.fullName}, please` : 'Please'} set a new password to continue.
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2 text-blue-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">
                You are using a temporary password. For your security, please choose a new password.
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Must be at least {PASSWORD_MIN_LENGTH} characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center px-4 py-2 bg-bloc-blue text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating Password...
              </>
            ) : (
              'Set New Password'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500">
          Business Leaders of Charlotte Member Portal
        </p>
      </div>
    </div>
  );
}
