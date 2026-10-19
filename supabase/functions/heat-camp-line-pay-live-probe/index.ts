import { linePayConfirmed, linePayGet, linePayPost, linePayWebUrl } from './line-pay-api.mjs';

// Short-lived, isolated production acceptance test. No camp registration or receipt.
const TOKEN_SHA256 = '0a6138bbd6472f5b3946cc42595661b331c938e639670821b9c465efc335e149';
const CHANNEL_ID = '1654237984';
const AMOUNT = 1;
const BASE = 'https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/heat-camp-line-pay-live-probe';
const PAGE = 'https://mchurch.online/line-pay-live-test.html';
const PAGE_ORIGIN = 'https://mchurch.online';
const DEADLINE = Date.parse('2026-10-21T23:59:00+08:00');
const encoder = new TextEncoder();

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': PAGE_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' },
});
const hmacHex = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('');
};
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};
const equalHex = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};
const credentials = () => {
  const secret = Deno.env.get('LINE_PAY_CHANNEL_SECRET') || '';
  if (!secret || Date.now() >= DEADLINE) throw Error('live_test_unavailable');
  return { channelId: CHANNEL_ID, secret, environment: 'production' };
};
const orderNumber = () => ('HB27T' + Date.now().toString(36) +
  crypto.randomUUID().replaceAll('-', '').slice(0, 8)).toUpperCase();
const signedState = async (secret: string, orderId: string, transactionId: string, issuedAt: number) => {
  const value = `${orderId}.${transactionId}.${issuedAt}`;
  return `${value}.${await hmacHex(secret, `live-acceptance:${value}:${AMOUNT}`)}`;
};
const verifyState = async (secret: string, state: string) => {
  const match = /^(HB27T[0-9A-Z]{10,22})\.(\d{16,22})\.(\d{13})\.([0-9a-f]{64})$/.exec(state);
  if (!match) throw Error('invalid_test_state');
  const issuedAt = Number(match[3]);
  if (issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > 60 * 60 * 1000)
    throw Error('expired_test_state');
  const expected = await signedState(secret, match[1], match[2], issuedAt);
  if (!equalHex(state.slice(-64), expected.slice(-64))) throw Error('invalid_test_state');
  return { orderId: match[1], transactionId: match[2] };
};

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': PAGE_ORIGIN, 'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type', 'access-control-max-age': '600',
  } });
  try {
    const c = credentials();
    if (mode === 'launch' && request.method === 'GET') return Response.redirect(PAGE, 302);
    if (mode === 'start' && request.method === 'POST') {
      const input = await request.json().catch(() => ({}));
      if (!equalHex(await sha256(String(input.token || '')), TOKEN_SHA256))
        return reply({ ok: false, error: 'not_available' }, 404);
      const orderId = orderNumber();
      const info = await linePayPost({ ...c, path: '/v4/payments/request', payload: {
        amount: AMOUNT, currency: 'TWD', orderId,
        packages: [{ id: 'live-acceptance', amount: AMOUNT, products: [{
          id: 'no-registration', name: 'LINE Pay 正式小額驗收（無營隊報名）', quantity: 1, price: AMOUNT,
        }] }],
        redirectUrls: { confirmUrlType: 'NONE' },
      } });
      const transactionId = String(info?.transactionId || '');
      if (!/^\d{16,22}$/.test(transactionId)) throw Error('invalid_transaction_id');
      const paymentUrl = linePayWebUrl(info?.paymentUrl?.web, 'production');
      const state = await signedState(c.secret, orderId, transactionId, Date.now());
      console.info('LINE Pay production test request created', { orderId, transactionId });
      return reply({ ok: true, paymentUrl, statusUrl: `${BASE}?mode=status&state=${encodeURIComponent(state)}` });
    }
    if (mode === 'status' && request.method === 'GET') {
      const { orderId, transactionId } = await verifyState(c.secret, url.searchParams.get('state') || '');
      const result = await linePayGet({ ...c, path: `/v4/payments/requests/${transactionId}/check` });
      if (result.returnCode === '0110') {
        const info = await linePayPost({ ...c, path: `/v4/payments/${transactionId}/confirm`,
          payload: { amount: AMOUNT, currency: 'TWD' } });
        if (!linePayConfirmed(info, { orderId, transactionId, amount: AMOUNT }))
          throw Error('confirmation_mismatch');
        console.info('LINE Pay production test payment confirmed', { orderId, transactionId });
        return reply({ ok: true, phase: 'confirmed', orderId, transactionId });
      }
      if (result.returnCode === '0123') {
        const details = await linePayGet({ ...c, path: `/v4/payments?transactionId=${transactionId}` });
        const info = Array.isArray(details.info)
          ? details.info.find(entry => String(entry.transactionId) === transactionId) : null;
        if (!linePayConfirmed(info, { orderId, transactionId, amount: AMOUNT }))
          throw Error('payment_details_mismatch');
        return reply({ ok: true, phase: 'confirmed', orderId, transactionId });
      }
      if (result.returnCode === '0000') return reply({ ok: true, phase: 'waiting', orderId, transactionId });
      return reply({ ok: false, phase: 'failed', linePayCode: result.returnCode }, 409);
    }
    return reply({ ok: false, error: 'not_available' }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'live_test_failed';
    console.error('LINE Pay production test acceptance', { mode, message });
    return reply({ ok: false, error: message }, 503);
  }
});
