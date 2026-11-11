/** Private settings API. No provider credentials, mail bodies or push transport.
 * A caller-scoped client is mandatory; never inject a service-role client here.
 * SQL RPCs independently authenticate and resolve the canonical staff owner.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const PROVIDERS = new Set(['gmail', 'icloud']);
const STATES = new Set(['connected', 'reconnect', 'paused', 'failed']);
const MAX_BODY = 4096;
class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const reject = (code, status) => { throw new ApiError(code, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
function exactKeys(value, keys) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) reject('invalid_request');
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) reject('json_required', 415);
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) reject('request_too_large', 413);
  if (!request.body) reject('invalid_request');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); reject('request_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { reject('invalid_request'); }
}
function command(body) {
  if (!object(body)) reject('invalid_request');
  if (body.action === 'state') {
    exactKeys(body, ['action', 'cursor', 'limit']);
    if (body.cursor != null && (typeof body.cursor !== 'string' || !UUID.test(body.cursor))) reject('invalid_cursor');
    const limit = body.limit === undefined ? 50 : body.limit;
    if (!integer(limit, 1, 100)) reject('invalid_limit');
    return ['personal_mail_get_state', { p_after: body.cursor ?? null, p_limit: limit }];
  }
  if (body.action === 'save_preferences') {
    exactKeys(body, ['action', 'time', 'expectedRevision']);
    if (typeof body.time !== 'string' || !TIME.test(body.time)) reject('invalid_time');
    if (!integer(body.expectedRevision, 0, 2147483646)) reject('invalid_revision');
    return ['personal_mail_set_time', { p_time: body.time, p_expected_revision: body.expectedRevision }];
  }
  if (body.action === 'pause_account') {
    exactKeys(body, ['action', 'accountId']);
    if (typeof body.accountId !== 'string' || !UUID.test(body.accountId)) reject('invalid_account');
    return ['personal_mail_pause_account', { p_account: body.accountId }];
  }
  reject('unsupported_action');
}
function settingsView(value) {
  if (!object(value) || !TIME.test(value.time) || value.timezone !== 'Asia/Taipei' ||
      value.deliveryEnabled !== false || !integer(value.revision, 0, 2147483647)) reject('invalid_backend_response', 502);
  return { time: value.time, timezone: 'Asia/Taipei', deliveryEnabled: false, revision: value.revision };
}
function accountView(row) {
  if (!object(row) || !UUID.test(row.id) || !PROVIDERS.has(row.provider) || !STATES.has(row.status) ||
      typeof row.email !== 'string' || row.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.email)) reject('invalid_backend_response', 502);
  // Deliberately omit owner IDs, provider subject, raw LINE IDs and all extra keys.
  return { id: row.id, provider: row.provider, email: row.email, status: row.status };
}
function responseView(body, data, limit) {
  const action = body.action;
  if (!object(data) || data.ok !== true) reject('invalid_backend_response', 502);
  if (action === 'save_preferences') {
    const settings = settingsView(data.settings);
    if (settings.time !== body.time || settings.revision !== body.expectedRevision + 1) reject('invalid_backend_response', 502);
    return { ok: true, settings };
  }
  if (action === 'pause_account') {
    if (!object(data.account) || !UUID.test(data.account.id) || data.account.id !== body.accountId || data.account.status !== 'paused') reject('invalid_backend_response', 502);
    return { ok: true, account: { id: data.account.id, status: 'paused' } };
  }
  if (!Array.isArray(data.accounts) || data.accounts.length > limit || !object(data.pagination) ||
      !integer(data.pagination.total, data.accounts.length, Number.MAX_SAFE_INTEGER) ||
      typeof data.pagination.hasMore !== 'boolean' ||
      (data.pagination.nextCursor !== null && !UUID.test(data.pagination.nextCursor)) ||
      data.pagination.hasMore !== (data.pagination.nextCursor !== null) ||
      !object(data.line) || !['missing', 'needs_verification'].includes(data.line.status)) reject('invalid_backend_response', 502);
  const accounts = data.accounts.map(accountView);
  if (new Set(accounts.map(row => row.id)).size !== accounts.length ||
      (data.pagination.hasMore && (!accounts.length || data.pagination.nextCursor !== accounts.at(-1).id))) reject('invalid_backend_response', 502);
  return { ok: true, settings: settingsView(data.settings), accounts,
    pagination: { total: data.pagination.total, hasMore: data.pagination.hasMore, nextCursor: data.pagination.nextCursor },
    line: { status: data.line.status }, capabilities: { sync: false, delivery: false, connect: false } };
}
const DATABASE_ERRORS = Object.freeze({
  '28000': ['login_required', 401], '28P01': ['login_required', 401],
  '42501': ['access_denied', 403], '22023': ['invalid_request', 400],
  'P0002': ['account_not_found', 404], '40001': ['settings_changed_reload', 409]
});
/** Dependencies are supplied only by the server entrypoint, never by request data. */
export function createHandler({ createUserClient, enabled = false, allowedOrigin = 'https://mscos.mchurch.online' } = {}) {
  if (typeof allowedOrigin !== 'string' || !/^https:\/\/[^/?#]+$/.test(allowedOrigin)) throw new Error('invalid_server_origin');
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', vary: 'Origin',
      ...(origin === allowedOrigin ? { 'access-control-allow-origin': allowedOrigin,
        'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info' } : {}) };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin !== allowedOrigin) reject('origin_not_allowed', 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') reject('method_not_allowed', 405);
      if (enabled !== true) reject('feature_not_enabled', 503);
      if (typeof createUserClient !== 'function') reject('not_configured', 503);
      const bearer = request.headers.get('authorization') || '';
      if (bearer.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(bearer)) reject('login_required', 401);
      const body = await readBody(request), [rpc, args] = command(body), token = bearer.slice(7);
      const db = createUserClient(token);
      // Never authorize from getSession(), decoded JWT, email or user_metadata.
      const verified = await db.auth.getUser(token);
      if (verified.error?.status >= 500) reject('identity_unavailable', 503);
      if (verified.error || !UUID.test(verified.data?.user?.id || '') || verified.data.user.is_anonymous === true) reject('login_required', 401);
      const result = await db.rpc(rpc, args);
      if (result.error) {
        const [code, status] = DATABASE_ERRORS[result.error.code] || ['service_unavailable', 503];
        reject(code, status);
      }
      return reply(200, responseView(body, result.data, args.p_limit));
    } catch (error) {
      // No logging of request bodies, headers, raw database errors or mail data.
      return reply(error instanceof ApiError ? error.status : 503,
        { ok: false, error: error instanceof ApiError ? error.code : 'service_unavailable' });
    }
  };
}
