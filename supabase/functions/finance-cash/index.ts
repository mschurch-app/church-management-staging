import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const APP_ORIGIN = 'https://mscos.mchurch.online';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = (origin: string) => ({
  ...(origin === APP_ORIGIN ? { 'access-control-allow-origin': origin } : {}),
  'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
  'access-control-allow-methods': 'POST,OPTIONS',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'vary': 'Origin'
});
const reply = (origin: string, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
type Input = Record<string, unknown>;

function client(key: string, token?: string) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  if (!url || !key) throw new Error('config');
  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function resultError(message: string) {
  const code = String(message || '').match(/(forbidden|target_not_mplus_admin|member_not_found|member_code_mismatch|unlinked_offering_code|version_conflict|batch_locked|batch_not_found|invalid_transition|cash_total_mismatch|bag_total_mismatch|verified_cash_mismatch|reason_required|invalid_batch|invalid_bag|invalid_bag_name|invalid_bag_total|invalid_counters|invalid_line|invalid_code)/)?.[1] || 'request_failed';
  return { code, status: code === 'forbidden' ? 403 : code === 'version_conflict' || code === 'batch_locked' ? 409 : 400 };
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(origin) });
  if (request.method !== 'POST' || origin !== APP_ORIGIN) return reply(origin, 403, { ok: false, code: 'forbidden' });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply(origin, 401, { ok: false, code: 'login_required' });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
  const publishable = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!serviceKey || !publishable) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
  const admin = client(serviceKey);
  const verified = await admin.auth.getUser(token);
  const user = verified.data.user;
  if (verified.error || !user) return reply(origin, 401, { ok: false, code: 'login_required' });
  const raw = await request.text();
  if (raw.length > 200_000) return reply(origin, 413, { ok: false, code: 'payload_too_large' });
  let input: Input;
  try { input = JSON.parse(raw); } catch { return reply(origin, 400, { ok: false, code: 'invalid_request' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(origin, 400, { ok: false, code: 'invalid_request' });
  const action = String(input.action || '');
  const checkedRoles = await Promise.all(['entry','cash_verify','approve'].map(async role => {
    const result = await admin.rpc('finance_user_can', { p_user: user.id, p_role: role });
    if (result.error) throw new Error('role_check_failed');
    return result.data === true ? role : null;
  })).catch(() => null);
  if (!checkedRoles) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
  const roles = new Set(checkedRoles.filter((role): role is string => role !== null));
  const userClient = client(publishable, token);
  const capability = await userClient.rpc('get_my_app_capabilities');
  const owner = !capability.error && capability.data?.is_owner === true;
  const canRead = owner || roles.size > 0;
  if (action === 'profile') return reply(origin, 200, { ok: true, roles: [...roles], owner });

  if (action === 'accounts') {
    if (!owner) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const result = await userClient.rpc('list_admin_accounts_v3');
    if (result.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const assigned = await admin.from('finance_staff_roles').select('user_id,role_key');
    if (assigned.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const accounts = (result.data || []).filter((row: { grants?: { church_id?: string }[]; is_active?: boolean }) => row.is_active && row.grants?.some(grant => grant.church_id === 'M+'));
    return reply(origin, 200, { ok: true, accounts: accounts.map((row: { user_id: string; display_name?: string; job_title?: string }) => ({
      userId: row.user_id, name: row.display_name || '管理同工', title: row.job_title || '',
      roles: (assigned.data || []).filter(item => item.user_id === row.user_id).map(item => item.role_key)
    })) });
  }

  if (action === 'assign_role') {
    if (!owner || !UUID.test(String(input.userId || '')) || !['entry','cash_verify','approve'].includes(String(input.role || '')) || typeof input.enabled !== 'boolean') {
      return reply(origin, 403, { ok: false, code: 'forbidden' });
    }
    const result = await admin.rpc('finance_assign_role', { p_actor: user.id, p_target: input.userId, p_role: input.role, p_enabled: input.enabled });
    if (result.error) { const error = resultError(result.error.message); return reply(origin, error.status, { ok: false, code: error.code }); }
    return reply(origin, 200, { ok: true });
  }

  if (action === 'workers') {
    if (!canRead) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const workerIds = await admin.from('finance_staff_roles').select('user_id').eq('role_key', 'entry');
    if (workerIds.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const ids = (workerIds.data || []).map(row => row.user_id);
    if (!ids.length) return reply(origin, 200, { ok: true, workers: [] });
    const people = await admin.from('pastoral_staff').select('app_user_id,display_name').in('app_user_id', ids).eq('is_active', true);
    if (people.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const names = new Map((people.data || []).map(row => [row.app_user_id, row.display_name]));
    return reply(origin, 200, { ok: true, workers: ids.map(id => ({ userId: id, name: names.get(id) || `同工 ${id.slice(0, 8)}` })) });
  }

  if (action === 'members') {
    if (!roles.has('entry')) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const term = String(input.search || '').trim().slice(0, 40);
    if (term.length < 1) return reply(origin, 200, { ok: true, members: [] });
    const escaped = term.replace(/[%_\\]/g, '\\$&');
    const [byName, byCode] = await Promise.all([
      admin.from('members').select('id,name,phone').eq('church_id', 'M+').is('archived_at', null).ilike('name', `%${escaped}%`).limit(15),
      /^\d{1,4}$/.test(term) ? admin.from('finance_member_codes').select('member_id,offering_code').eq('offering_code', term.padStart(4, '0')).limit(1) : Promise.resolve({ data: [], error: null })
    ]);
    if (byName.error || byCode.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const byId = new Map((byName.data || []).map(row => [String(row.id), row]));
    for (const code of byCode.data || []) {
      if (!byId.has(String(code.member_id))) {
        const member = await admin.from('members').select('id,name,phone').eq('id', code.member_id).eq('church_id', 'M+').is('archived_at', null).maybeSingle();
        if (member.data) byId.set(String(member.data.id), member.data);
      }
    }
    const memberIds = [...byId.keys()];
    const codes = memberIds.length ? await admin.from('finance_member_codes').select('member_id,offering_code').in('member_id', memberIds) : { data: [], error: null };
    if (codes.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const codeById = new Map((codes.data || []).map(row => [String(row.member_id), row.offering_code]));
    return reply(origin, 200, { ok: true, members: [...byId.values()].map(row => ({ id: row.id, name: row.name, phone: row.phone || '', offeringCode: codeById.get(String(row.id)) || '' })) });
  }

  if (action === 'assign_code') {
    if (!roles.has('entry') || !Number.isSafeInteger(Number(input.memberId))) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const code = String(input.offeringCode || '').padStart(4, '0');
    const result = await admin.rpc('finance_assign_member_code', { p_actor: user.id, p_member: input.memberId, p_code: code });
    if (result.error) { const error = resultError(result.error.message); return reply(origin, error.status, { ok: false, code: error.code }); }
    return reply(origin, 200, { ok: true, offeringCode: code });
  }

  if (action === 'list') {
    if (!canRead) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const result = await admin.from('finance_cash_batches').select('id,offering_date,status,version,counter_1,counter_2,counted_cash,entered_total,created_at,updated_at')
      .eq('church_id', 'M+').order('offering_date', { ascending: false }).limit(50);
    return result.error ? reply(origin, 503, { ok: false, code: 'service_unavailable' }) : reply(origin, 200, { ok: true, batches: result.data });
  }

  if (action === 'get') {
    if (!canRead || !UUID.test(String(input.batchId || ''))) return reply(origin, 403, { ok: false, code: 'forbidden' });
    const batch = await admin.from('finance_cash_batches').select('*').eq('id', input.batchId).eq('church_id', 'M+').maybeSingle();
    if (batch.error || !batch.data) return reply(origin, 404, { ok: false, code: 'batch_not_found' });
    const bags = await admin.from('finance_cash_bags').select('*').eq('batch_id', input.batchId).order('bag_no');
    if (bags.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const ids = (bags.data || []).map(row => row.id);
    const lines = ids.length ? await admin.from('finance_cash_lines').select('bag_id,category,designation,amount').in('bag_id', ids) : { data: [], error: null };
    if (lines.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    const events = await admin.from('finance_cash_events').select('version,action,from_status,to_status,actor_user_id,reason,created_at').eq('batch_id', input.batchId).order('version');
    if (events.error) return reply(origin, 503, { ok: false, code: 'service_unavailable' });
    return reply(origin, 200, { ok: true, batch: batch.data, bags: (bags.data || []).map(bag => ({ ...bag, lines: (lines.data || []).filter(line => line.bag_id === bag.id) })), events: events.data });
  }

  if (action === 'save') {
    if (!roles.has('entry') || (input.batchId != null && !UUID.test(String(input.batchId))) || !input.data || typeof input.data !== 'object') {
      return reply(origin, 403, { ok: false, code: 'forbidden' });
    }
    const result = await admin.rpc('finance_save_cash_batch', {
      p_actor: user.id, p_batch_id: input.batchId || null,
      p_expected_version: input.batchId ? input.version : null, p_data: input.data
    });
    if (result.error) { const error = resultError(result.error.message); return reply(origin, error.status, { ok: false, code: error.code }); }
    return reply(origin, 200, { ok: true, batch: result.data });
  }

  if (action === 'transition') {
    if (!canRead || !UUID.test(String(input.batchId || '')) || !['submit','verify_cash','approve','return'].includes(String(input.step || ''))) {
      return reply(origin, 403, { ok: false, code: 'forbidden' });
    }
    const result = await admin.rpc('finance_transition_cash_batch', {
      p_actor: user.id, p_batch_id: input.batchId, p_expected_version: input.version,
      p_action: input.step, p_verified_cash: input.verifiedCash ?? null, p_reason: input.reason ?? null
    });
    if (result.error) { const error = resultError(result.error.message); return reply(origin, error.status, { ok: false, code: error.code }); }
    return reply(origin, 200, { ok: true, batch: result.data });
  }
  return reply(origin, 400, { ok: false, code: 'invalid_request' });
});
