// Supabase Edge Function: push-send
// Sends an Expo push notification to all of a member's registered devices. Called by
// the DB notify_* triggers via send_push() (pg_net) with the shared x-kb-secret.
// Prunes tokens Expo reports as DeviceNotRegistered.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SECRET = Deno.env.get('KB_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SECRET || req.headers.get('x-kb-secret') !== SECRET) return json({ error: 'unauthorized' }, 401);

  const { member_id, title, body, data } = await req.json().catch(() => ({}));
  if (!member_id || !title) return json({ error: 'bad_request' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: tokens } = await sb.from('push_tokens').select('expo_push_token').eq('member_id', member_id);
  if (!tokens || tokens.length === 0) return json({ ok: true, sent: 0 });

  const messages = tokens.map((t) => ({
    to: t.expo_push_token,
    title,
    body: body ?? '',
    data: data ?? {},
    sound: 'default',
  }));

  const resp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await resp.json().catch(() => null);

  // Prune tokens Expo says are dead so we don't keep pushing to them.
  const dead: string[] = [];
  const tickets = result?.data;
  if (Array.isArray(tickets)) {
    tickets.forEach((tk: { status?: string; details?: { error?: string } }, i: number) => {
      if (tk?.status === 'error' && tk?.details?.error === 'DeviceNotRegistered') {
        dead.push(messages[i].to);
      }
    });
  }
  if (dead.length) await sb.from('push_tokens').delete().in('expo_push_token', dead);

  return json({ ok: true, sent: messages.length, pruned: dead.length });
});
