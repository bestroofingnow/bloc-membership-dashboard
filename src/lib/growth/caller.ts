import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Caller {
  userId: string;
  email: string;
  role: 'admin' | 'chapter_director' | 'member';
  /** The caller's members.id, or null if their login email matches no member. */
  memberId: string | null;
  isStaff: boolean;
  /** Service-role client (bypasses RLS) — server-only. */
  sb: SupabaseClient;
}

/**
 * Resolve the logged-in caller from a bearer token: their auth id, role
 * (profiles.role), and member id (members.email match). Returns null if the
 * token is invalid or the server is misconfigured. The growth routes are the
 * only place a member's own leads are exposed, always scoped to this caller.
 */
export async function resolveCaller(token: string): Promise<Caller | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user?.id || !u.user.email) return null;

  const userId = u.user.id;
  const email = u.user.email;

  const { data: prof } = await sb.from('profiles').select('role, member_id').eq('id', userId).maybeSingle();
  const role = ((prof?.role as Caller['role']) ?? 'member');

  // Prefer the deterministic profiles.member_id FK (migration 019, backfilled only
  // on an exactly-one email match). Fall back to an email lookup ONLY when it is
  // unambiguous — never bind to an arbitrary row when emails collide (019 permits
  // duplicate emails until cleared), or a member could be scoped to another
  // member's leads.
  let memberId = (prof?.member_id as string | undefined) ?? null;
  if (!memberId) {
    const { data: mems } = await sb.from('members').select('id').ilike('email', email).limit(2);
    if (mems && mems.length === 1) memberId = mems[0].id as string;
  }

  return {
    userId,
    email,
    role,
    memberId,
    isStaff: role === 'admin' || role === 'chapter_director',
    sb,
  };
}
