import { createClient } from '@supabase/supabase-js';

export type AdminOnlyProfile = { id: string; role: 'admin'; chapter: string | null };

/** Pure: pull the bearer token out of an Authorization header. */
export function parseBearerToken(authHeader: string | null): string {
  const auth = authHeader ?? '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export type RequireAdminResult =
  | { ok: true; profile: AdminOnlyProfile }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * Verify Authorization: Bearer <jwt> and require role='admin'.
 * WA sync is org-wide, so directors are NOT sufficient.
 * 401 = no/invalid token; 403 = authenticated but not admin; 500 = misconfig.
 */
export async function requireAdmin(req: Request): Promise<RequireAdminResult> {
  const token = parseBearerToken(req.headers.get('authorization'));
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { ok: false, status: 500, error: 'server_misconfigured' };

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: 'unauthorized' };

  const { data: profile } = await sb
    .from('profiles')
    .select('id,role,chapter')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return { ok: false, status: 401, error: 'unauthorized' };
  if (profile.role !== 'admin') return { ok: false, status: 403, error: 'forbidden' };

  return { ok: true, profile: profile as AdminOnlyProfile };
}
