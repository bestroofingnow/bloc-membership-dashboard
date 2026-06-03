import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Force "configured" so we exercise the disabled-guard path, not the
// "not configured" branch. The guard must reject self-signup even when
// Supabase is fully configured.
vi.mock('@/lib/supabase', () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signUp: vi.fn(),
  };
  return {
    supabase: { auth, from: vi.fn() },
    isSupabaseConfigured: () => true,
    isDemoMode: () => false,
  };
});

import { supabase } from '@/lib/supabase';

function Probe() {
  const { signUp } = useAuth();
  return (
    <button
      onClick={async () => {
        const { error } = await signUp('new@example.com', 'password123', 'New Member');
        const el = document.getElementById('result');
        if (el) el.textContent = error ?? 'OK';
      }}
    >
      signup
    </button>
  );
}

describe('AuthContext.signUp (self-signup disabled guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns the disabled error and never calls supabase.auth.signUp', async () => {
    render(
      <AuthProvider>
        <Probe />
        <div id="result" />
      </AuthProvider>,
    );

    screen.getByText('signup').click();

    await waitFor(() => {
      expect(document.getElementById('result')?.textContent).toBe(
        'Self-signup is disabled. Apply at /join.',
      );
    });

    expect((supabase.auth.signUp as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
