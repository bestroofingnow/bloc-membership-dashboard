import { createClient } from '@supabase/supabase-js';

export type AdminRole = 'admin' | 'chapter_director';

export interface AdminProfile {
  id: string;
  role: AdminRole;
  chapter: string | null;
}

/**
 * Verify the Authorization: Bearer <jwt> header against Supabase and return
 * the caller's profile if they're an admin or chapter_director.
 *
 * Returns null if not authenticated or not authorized.
 * Server routes wrap this and return 401 / 403 as appropriate.
 */
export async function requireDirector(req: Request): Promise<AdminProfile | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('id,role,chapter')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return null;
  if (profile.role !== 'admin' && profile.role !== 'chapter_director') return null;

  return profile as AdminProfile;
}
