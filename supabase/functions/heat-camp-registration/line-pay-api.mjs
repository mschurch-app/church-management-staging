// LINE Pay Online API v4 transport. Keep channel credentials in Edge Function secrets.
const encoder = new TextEncoder();
const apiHosts = {
  test: 'https://sandbox-api-pay.line.me',
  production: 'https://api-pay.line.me',
};

export async function linePaySignature(secret, apiPath, body, nonce) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(secret + apiPath + body + nonce));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

// LINE Pay transaction IDs exceed Number.MAX_SAFE_INTEGER. Preserve them as strings.
export function parseLinePayResponse(raw) {
  return JSON.parse(raw.replace(/("transactionId"\s*:\s*)(\d{16,22})(?=\s*[,}])/g, '$1"$2"'));
}

export async function linePayPost({ channelId, secret, environment, path, payload, timeoutMs = 45000, fetcher = fetch }) {
  if (!/^\d+$/.test(channelId) || !secret || !apiHosts[environment] || !/^\/v4\/payments\//.test(path)) {
    throw new Error('line_pay_config_invalid');
  }
  const body = JSON.stringify(payload);
  const nonce = crypto.randomUUID();
  const signature = await linePaySignature(secret, path, body, nonce);
  const response = await fetcher(apiHosts[environment] + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-LINE-ChannelId': channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('line_pay_http_error');
  const result = parseLinePayResponse(await response.text());
  if (result?.returnCode !== '0000') throw new Error('line_pay_' + String(result?.returnCode || 'unknown'));
  return result.info;
}

export async function linePayGet({ channelId, secret, environment, path, timeoutMs = 25000, fetcher = fetch }) {
  if (!/^\d+$/.test(channelId) || !secret || !apiHosts[environment] ||
      !/^\/v4\/payments(?:\?|\/requests\/\d{16,22}\/check$)/.test(path)) {
    throw new Error('line_pay_config_invalid');
  }
  const nonce = crypto.randomUUID();
  const queryIndex = path.indexOf('?');
  const apiPath = queryIndex < 0 ? path : path.slice(0, queryIndex);
  const queryString = queryIndex < 0 ? '' : path.slice(queryIndex + 1);
  const signature = await linePaySignature(secret, apiPath, queryString, nonce);
  const response = await fetcher(apiHosts[environment] + path, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      'X-LINE-ChannelId': channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('line_pay_http_error');
  const result = parseLinePayResponse(await response.text());
  if (!new Set(['0000', '0110', '0121', '0122', '0123']).has(String(result?.returnCode))) {
    throw new Error('line_pay_' + String(result?.returnCode || 'unknown'));
  }
  return result;
}

export function linePayWebUrl(value, environment) {
  const url = new URL(String(value));
  const allowedHost = environment === 'test' ? 'sandbox-web-pay.line.me' : 'web-pay.line.me';
  if (url.protocol !== 'https:' || url.hostname !== allowedHost) throw new Error('line_pay_redirect_invalid');
  return url.href;
}

// Use the database's amount and order number, never values supplied by the browser.
export function linePayRequestPayload({ orderId, amount, confirmUrl, cancelUrl }) {
  if (!/^HB27[0-9A-Z]{10,22}$/.test(String(orderId)) ||
      !Number.isSafeInteger(amount) || amount <= 0 ||
      ![confirmUrl, cancelUrl].every(value => {
        try { return new URL(value).protocol === 'https:'; } catch { return false; }
      })) throw new Error('line_pay_request_invalid');
  return {
    amount, currency: 'TWD', orderId,
    packages: [{ id: 'heat-camp-2027', amount, products: [{
      id: 'registration', name: '2027 熱火籃球營報名費', quantity: 1, price: amount,
    }] }],
    redirectUrls: { confirmUrl, cancelUrl },
  };
}

// A successful API response alone is insufficient: reconcile it with our order first.
export function linePayConfirmed(info, { orderId, transactionId, amount }) {
  const paid = Array.isArray(info?.payInfo)
    ? info.payInfo.reduce((sum, row) => sum + Number(row?.amount), 0) : NaN;
  return info?.orderId === orderId &&
    String(info?.transactionId ?? '') === String(transactionId) &&
    (info?.transactionType == null || info.transactionType === 'PAYMENT') &&
    (info?.currency == null || info.currency === 'TWD') &&
    Number.isSafeInteger(amount) && paid === amount;
}

// Browser redirects are untrusted. Only LINE's signed status decides whether
// confirmation or closure is allowed; a repeat redirect must stay idempotent.
export function linePayNextStep(returnCode, redirectMode) {
  if (returnCode === '0121') return 'cancel';
  if (returnCode === '0122') return 'fail';
  if (returnCode === '0123') return 'reconcile';
  if (returnCode === '0110' && redirectMode === 'line_confirm') return 'confirm';
  return 'wait';
}
