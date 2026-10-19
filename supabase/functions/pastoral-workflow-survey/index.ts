import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import { ENTITY_KEYS, SURVEY_VERSION, normalizeSurveyAnswers } from './validation.mjs';

const APP_ORIGIN = 'https://mscos.mchurch.online';
const LINE_CHANNEL_ID = '2011645391';
type Staff = { id: string; name: string; role: string; entityKeys: string[] };

class ApiError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
function headers(origin: string) {
  return {
    ...(origin === APP_ORIGIN ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-headers': 'authorization,content-type,apikey',
    'access-control-allow-methods': 'POST,OPTIONS',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}
function json(origin: string, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: headers(origin) });
}
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new ApiError('unavailable', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function lineSubject(token: string) {
  if (!token || token.length > 8192) return null;
  try {
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token, client_id: LINE_CHANNEL_ID }),
    });
    if (!response.ok) return null;
    const claims = await response.json();
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'https://access.line.me' || claims.aud !== LINE_CHANNEL_ID ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
      typeof claims.sub !== 'string' || !/^U[0-9a-f]{32}$/.test(claims.sub)) return null;
    return claims.sub as string;
  } catch { return null; }
}
async function staffFromToken(db: ReturnType<typeof adminClient>, token: string): Promise<Staff> {
  if (!token || token.length > 8192) throw new ApiError('login_required', 401);
  const appUser = await db.auth.getUser(token);
  if (!appUser.error && appUser.data.user) {
    const mapped = await db.rpc('get_pastoral_staff_for_app_user', { p_user: appUser.data.user.id });
    if (!mapped.error && mapped.data) return {
      id: mapped.data.id, name: mapped.data.name || '教會同工', role: mapped.data.role,
      entityKeys: mapped.data.entityKeys || [],
    };
    throw new ApiError('staff_forbidden', 403);
  }
  const subject = await lineSubject(token);
  if (!subject) throw new ApiError('login_required', 401);
  const person = await db.from('pastoral_staff').select('id,display_name,role,is_active')
    .eq('line_subject', subject).maybeSingle();
  if (person.error) throw new ApiError('unavailable', 503);
  if (!person.data?.is_active) throw new ApiError('staff_forbidden', 403);
  const access = await db.from('pastoral_staff_access').select('entity_key').eq('staff_id', person.data.id);
  if (access.error) throw new ApiError('unavailable', 503);
  return { id: person.data.id, name: person.data.display_name, role: person.data.role,
    entityKeys: [...new Set((access.data || []).map(row => row.entity_key))] };
}
function entityFor(staff: Staff, value: unknown) {
  if (typeof value !== 'string' || !ENTITY_KEYS.includes(value) || !staff.entityKeys.includes(value))
    throw new ApiError('entity_forbidden', 403);
  return value;
}
function canManage(staff: Staff) { return staff.role === 'pastor' || staff.role === 'admin'; }

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origin === APP_ORIGIN
    ? new Response('ok', { headers: headers(origin) })
    : json(origin, { ok: false, error: 'forbidden' }, 403);
  if (request.method !== 'POST' || origin !== APP_ORIGIN) return json(origin, { ok: false, error: 'forbidden' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 20000) throw new ApiError('answers_too_large', 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('invalid_request');
    const db = adminClient();
    const staff = await staffFromToken(db, (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    const entityKey = entityFor(staff, body.entityKey);
    if (body.action === 'load') {
      const result = await db.from('pastoral_workflow_survey_responses')
        .select('answers,updated_at,submitted_at').eq('entity_key', entityKey)
        .eq('staff_id', staff.id).eq('survey_version', SURVEY_VERSION).maybeSingle();
      if (result.error) throw new ApiError('unavailable', 503);
      return json(origin, { ok: true, canManage: canManage(staff), name: staff.name,
        response: result.data || null });
    }
    if (body.action === 'save') {
      let answers;
      try { answers = normalizeSurveyAnswers(body.answers); }
      catch (error) { throw new ApiError(error instanceof Error ? error.message : 'invalid_answers'); }
      const now = new Date().toISOString();
      const saved = await db.from('pastoral_workflow_survey_responses').upsert({
        entity_key: entityKey, staff_id: staff.id, survey_version: SURVEY_VERSION,
        answers, submitted_at: now, updated_at: now,
      }, { onConflict: 'entity_key,staff_id,survey_version' }).select('updated_at').single();
      if (saved.error) throw new ApiError('unavailable', 503);
      return json(origin, { ok: true, updatedAt: saved.data.updated_at });
    }
    if (body.action === 'list') {
      if (!canManage(staff)) throw new ApiError('forbidden', 403);
      const responses = await db.from('pastoral_workflow_survey_responses')
        .select('staff_id,answers,submitted_at,updated_at').eq('entity_key', entityKey)
        .eq('survey_version', SURVEY_VERSION).order('updated_at', { ascending: false }).limit(500);
      if (responses.error) throw new ApiError('unavailable', 503);
      const ids = [...new Set((responses.data || []).map(row => row.staff_id))];
      const people = ids.length
        ? await db.from('pastoral_staff').select('id,display_name').in('id', ids)
        : { data: [], error: null };
      if (people.error) throw new ApiError('unavailable', 503);
      const names = new Map((people.data || []).map(row => [row.id, row.display_name]));
      return json(origin, { ok: true, items: (responses.data || []).map(row => ({
        name: names.get(row.staff_id) || '教會同工', answers: row.answers,
        submittedAt: row.submitted_at, updatedAt: row.updated_at,
      })) });
    }
    throw new ApiError('invalid_action');
  } catch (error) {
    if (error instanceof ApiError) return json(origin, { ok: false, error: error.code }, error.status);
    if (error instanceof SyntaxError) return json(origin, { ok: false, error: 'invalid_request' }, 400);
    console.error('Workflow survey request failed', error instanceof Error ? error.message : 'unknown');
    return json(origin, { ok: false, error: 'unavailable' }, 503);
  }
});
