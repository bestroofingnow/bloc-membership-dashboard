export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'error';

/**
 * Share a URL via the Web Share API when available (mobile share sheet),
 * otherwise copy it to the clipboard. Returns what happened so the caller
 * can show the right confirmation.
 */
export async function shareLink(url: string, title: string): Promise<ShareResult> {
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; url?: string }) => Promise<void>;
  };

  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      return 'error';
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'error';
  }
}
