import { createClient } from 'npm:@supabase/supabase-js@2.102.0';
import { notifyMplusNewcomer } from '../_shared/newcomer-line-notification.mjs';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('origin');
  if (origin !== 'https://mscos.mchurch.online') return json({ error: 'origin_rejected' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'json_required' }, 415);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const authorization = request.headers.get('authorization') || '';
  if (!url || !serviceKey || !anonKey || !authorization.startsWith('Bearer ')) return json({ error: 'login_required' }, 401);

  let body: { memberId?: number };
  try { body = await request.json(); } catch { return json({ error: 'invalid_input' }, 400); }
  if (!body || Object.keys(body).some(key => key !== 'memberId') || !Number.isSafeInteger(body.memberId) || Number(body.memberId) < 1) return json({ error: 'invalid_input' }, 400);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const verified = await authClient.auth.getUser();
  if (verified.error || !verified.data.user) return json({ error: 'login_required' }, 401);
  const access = await authClient.rpc('get_my_church_access');
  if (access.error || !Array.isArray(access.data) || !access.data.some(row => row.church_id === 'M+' && row.permission === 'members')) return json({ error: 'forbidden' }, 403);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const result = await notifyMplusNewcomer({ db, memberId: Number(body.memberId) });
    if (result.status === 'sent') return json({ sent: true });
    return json({ sent: false, error: result.status }, 503);
  } catch {
    return json({ error: 'notification_failed' }, 503);
  }
});
