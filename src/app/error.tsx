'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Global error boundary for the dashboard. Renders for uncaught errors in
 * route segments. Logs to the console so any wired monitoring catches it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard runtime error', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="max-w-md text-center">
        <p className="text-sm uppercase tracking-widest text-red-600 font-semibold">Something broke</p>
        <h1 className="mt-4 text-3xl font-display font-bold text-slate-900">An unexpected error</h1>
        <p className="mt-3 text-slate-600">
          The dashboard hit a snag while rendering. Your data is safe — this is just a display issue.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-400 font-mono">Error ID: {error.digest}</p>
        )}
        <div className="mt-8 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded bg-bloc-navy text-white px-4 py-2 text-sm hover:bg-bloc-blue"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded border px-4 py-2 text-sm hover:bg-white"
          >
            Reload dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
