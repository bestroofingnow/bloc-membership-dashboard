'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * A floating "back to top" button that appears after the user scrolls
 * past 600px. Hidden by default; only renders when relevant. Pure presentational.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > 600);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      }}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-30 rounded-full bg-bloc-navy text-white shadow-lg hover:bg-bloc-blue p-3 no-print"
    >
      <ArrowUp size={18} />
    </button>
  );
}
