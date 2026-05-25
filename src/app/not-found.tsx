import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <div className="max-w-md text-center">
        <p className="text-sm uppercase tracking-widest text-bloc-blue font-semibold">404</p>
        <h1 className="mt-4 text-3xl font-display font-bold text-slate-900">Page not found</h1>
        <p className="mt-3 text-slate-600">
          The link you followed isn&apos;t one we recognize. If you scanned a QR code, the link may
          have expired or been revoked — ask whoever invited you for a fresh one.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link
            href="/"
            className="rounded bg-bloc-navy text-white px-4 py-2 text-sm hover:bg-bloc-blue"
          >
            Go to the dashboard
          </Link>
          <Link
            href="/guest"
            className="rounded border px-4 py-2 text-sm hover:bg-white"
          >
            Visit as a guest
          </Link>
        </div>
      </div>
    </main>
  );
}
