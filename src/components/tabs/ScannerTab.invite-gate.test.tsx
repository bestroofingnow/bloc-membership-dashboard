import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ScannedCard } from '@/hooks/useCardScanner';

// P0-c: the "Invite to event" panel inside ScannerTab is defense-in-depth
// gated to staff (admin / chapter_director). Plain members must never see it,
// even when a scanned card is otherwise invite-eligible (has a guestId + email).

// A scanned card that satisfies the non-role half of canInvite
// (card.guestId !== null && !!card.email).
const eligibleCard: ScannedCard = {
  name: 'Jane Guest',
  email: 'jane@example.com',
  guestId: 'guest-123',
  matchType: 'new_guest',
  guestName: 'Jane Guest',
  memberName: null,
  scanCount: 1,
} as unknown as ScannedCard;

vi.mock('@/hooks/useCardScanner', () => ({
  useCardScanner: () => ({
    scanning: false,
    exporting: false,
    error: null,
    scannedCard: eligibleCard,
    exportSuccess: false,
    scanCard: vi.fn(),
    exportToCRM: vi.fn(),
    reset: vi.fn(),
    updateField: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({
    events: [
      {
        id: 'evt-1',
        title: 'Uptown Lunch',
        starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        public_visible: true,
        chapter: 'Uptown',
      },
    ],
  }),
}));

// Role is the only variable the test flips.
const roleMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => roleMock(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { ScannerTab } from './ScannerTab';

const INVITE_PANEL = 'Invite them to a meeting';

describe('ScannerTab invite panel role gate (P0-c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('plain member does NOT see the invite panel even for an eligible card', () => {
    roleMock.mockReturnValue({ isAdmin: false, isDirector: false });
    render(<ScannerTab />);
    expect(screen.queryByText(INVITE_PANEL)).not.toBeInTheDocument();
  });

  test('chapter director sees the invite panel for an eligible card', () => {
    roleMock.mockReturnValue({ isAdmin: false, isDirector: true });
    render(<ScannerTab />);
    expect(screen.getByText(INVITE_PANEL)).toBeInTheDocument();
  });

  test('admin sees the invite panel for an eligible card', () => {
    roleMock.mockReturnValue({ isAdmin: true, isDirector: false });
    render(<ScannerTab />);
    expect(screen.getByText(INVITE_PANEL)).toBeInTheDocument();
  });
});
