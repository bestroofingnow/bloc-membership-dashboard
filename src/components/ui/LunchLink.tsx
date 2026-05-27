'use client';

import { useState } from 'react';
import { CalendarPlus, Share2, QrCode, X } from 'lucide-react';
import { QrImage } from './QrImage';
import { useToast } from './Toast';
import { shareLink } from '@/lib/share';

interface Props {
  /** Chapter label, e.g. "North". */
  chapter: string;
  /** Registration URL. */
  url: string;
}

/**
 * A compact lunch-registration row: open the page, share the link (native
 * share sheet with clipboard fallback), or pop a scannable QR code.
 */
export function LunchLink({ chapter, url }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const { show } = useToast();
  const title = `BLOC ${chapter} Lunch`;

  const handleShare = async () => {
    const result = await shareLink(url, title);
    if (result === 'copied') show('Link copied to clipboard');
    else if (result === 'error') show('Could not share link', { kind: 'error' });
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-bloc-blue hover:underline font-medium"
      >
        <CalendarPlus size={15} />
        Register for lunch
      </a>
      <button
        type="button"
        onClick={handleShare}
        title="Share registration link"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-bloc-blue transition-colors"
      >
        <Share2 size={15} />
        Share
      </button>
      <button
        type="button"
        onClick={() => setQrOpen((v) => !v)}
        title="Show QR code"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-bloc-blue transition-colors"
      >
        <QrCode size={15} />
        QR
      </button>

      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 shadow-xl flex flex-col items-center gap-4 max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <p className="font-semibold text-slate-700">{title}</p>
              <button type="button" onClick={() => setQrOpen(false)} aria-label="Close">
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <QrImage url={url} size={220} alt={`${title} registration QR`} />
            <p className="text-xs text-slate-500 text-center break-all">{url}</p>
          </div>
        </div>
      )}
    </div>
  );
}
