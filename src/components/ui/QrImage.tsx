'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  url: string;
  size?: number;
  alt?: string;
  className?: string;
}

/**
 * Renders a QR code as an inline SVG data URI generated client-side with
 * `qrcode`. No third-party HTTP dependency. Falls back to a placeholder
 * if generation fails (which shouldn't happen for short URLs).
 */
export function QrImage({ url, size = 200, alt, className }: Props) {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((uri) => { if (!cancelled) setDataUri(uri); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (error) {
    return (
      <div
        role="img"
        aria-label={alt ?? 'QR code unavailable'}
        style={{ width: size, height: size }}
        className={`bg-gray-100 border border-dashed flex items-center justify-center text-xs text-gray-500 ${className ?? ''}`}
      >
        QR error
      </div>
    );
  }

  if (!dataUri) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-gray-100 animate-pulse ${className ?? ''}`}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUri} alt={alt ?? 'QR code'} width={size} height={size} className={className} />;
}
