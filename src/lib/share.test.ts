import { describe, test, expect, vi, afterEach } from 'vitest';
import { shareLink } from './share';

describe('shareLink()', () => {
  const origShare = (navigator as any).share;
  const origClipboard = (navigator as any).clipboard;

  afterEach(() => {
    (navigator as any).share = origShare;
    (navigator as any).clipboard = origClipboard;
    vi.restoreAllMocks();
  });

  test('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = share;
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(share).toHaveBeenCalledWith({ title: 'BLOC Lunch', url: 'https://x.test/r' });
    expect(result).toBe('shared');
  });

  test('falls back to clipboard copy when share is unavailable', async () => {
    (navigator as any).share = undefined;
    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(writeText).toHaveBeenCalledWith('https://x.test/r');
    expect(result).toBe('copied');
  });

  test('returns "cancelled" when the user dismisses the share sheet', async () => {
    const err = Object.assign(new Error('cancel'), { name: 'AbortError' });
    (navigator as any).share = vi.fn().mockRejectedValue(err);
    const result = await shareLink('https://x.test/r', 'BLOC Lunch');
    expect(result).toBe('cancelled');
  });
});
