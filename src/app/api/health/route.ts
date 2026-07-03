import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/guest/supabase-server';

/**
 * Lightweight health probe for uptime monitors (UptimeRobot, Vercel monitoring, etc.).
 *
 * Returns 200 with { ok: true } if the database connection works.
 * Returns 503 with { ok: false, error } otherwise.
 *
 * Public — no auth. Intentionally avoids querying anything sensitive.
 */
export async function GET() {
  const started = Date.now();
  try {
    // Verify the env required to talk to Supabase is present.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'supabase_env_missing' },
        { status: 503 },
      );
    }
    const sb = getServerSupabase();
    // Cheap probe: count one row from a table that always exists. `count: 'exact', head: true`
    // returns just the count without payload — fast and small.
    const { error } = await sb.from('events').select('id', { count: 'exact', head: true });
    if (error) {
      // Log the detail server-side; never echo internal DB errors on a public route.
      console.error('health probe db error', error);
      return NextResponse.json(
        { ok: false, error: 'db_unreachable' },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      checked: 'supabase',
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    console.error('health probe unexpected error', e);
    return NextResponse.json(
      { ok: false, error: 'unexpected' },
      { status: 503 },
    );
  }
}
