import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { linePayConfirmed, linePayGet, linePayNextStep, linePayPost, linePayRequestPayload, linePaySignature, linePayWebUrl, parseLinePayResponse } from './line-pay-api.mjs';

test('signs the exact POST path and serialized body with the channel secret', async () => {
  const secret = 'example-secret';
  const path = '/v4/payments/request';
  const body = '{"amount":100,"currency":"TWD"}';
  const nonce = 'test-nonce';
  const expected = createHmac('sha256', secret).update(secret + path + body + nonce).digest('base64');
  assert.equal(await linePaySignature(secret, path, body, nonce), expected);
});

test('keeps the 19-digit transaction ID exact and checks the redirect host', () => {
  const result = parseLinePayResponse('{"returnCode":"0000","info":{"transactionId":2023042201206549310}}');
  assert.equal(result.info.transactionId, '2023042201206549310');
  assert.equal(linePayWebUrl('https://sandbox-web-pay.line.me/web/payment/wait?id=1', 'test'),
    'https://sandbox-web-pay.line.me/web/payment/wait?id=1');
  assert.throws(() => linePayWebUrl('https://example.com/steal', 'production'), /line_pay_redirect_invalid/);
});

test('uses sandbox endpoint and does not return a failed payment as a success', async () => {
  let calledUrl;
  await assert.rejects(linePayPost({
    channelId: '1654237984', secret: 'test-secret', environment: 'test',
    path: '/v4/payments/request', payload: { amount: 100, currency: 'TWD' },
    fetcher: async (url) => { calledUrl = url; return new Response('{"returnCode":"1101"}', { status: 200 }); },
  }), /line_pay_1101/);
  assert.equal(calledUrl, 'https://sandbox-api-pay.line.me/v4/payments/request');
});

test('builds one balanced TWD package from the trusted order amount', () => {
  const payload = linePayRequestPayload({
    orderId: 'HB27ABCDEFGHIJ', amount: 7000,
    confirmUrl: 'https://mchurch.online/line/confirm',
    cancelUrl: 'https://mchurch.online/line/cancel',
  });
  assert.equal(payload.packages[0].products[0].price, 7000);
  assert.equal(payload.packages[0].amount, payload.amount);
  assert.equal(payload.currency, 'TWD');
  assert.throws(() => linePayRequestPayload({
    orderId: payload.orderId, amount: 7000,
    confirmUrl: 'http://example.com/confirm', cancelUrl: payload.redirectUrls.cancelUrl,
  }), /line_pay_request_invalid/);
});

test('rejects a confirmed response for another order or amount', () => {
  const expected = { orderId: 'HB27ABCDEFGHIJ', transactionId: '2023042201206549310', amount: 7000 };
  const info = { orderId: expected.orderId, transactionId: expected.transactionId,
    payInfo: [{ method: 'CREDIT_CARD', amount: 6000 }, { method: 'POINT', amount: 1000 }] };
  assert.equal(linePayConfirmed(info, expected), true);
  assert.equal(linePayConfirmed({ ...info, orderId: 'HB27XXXXXXXXXX' }, expected), false);
  assert.equal(linePayConfirmed({ ...info, payInfo: [{ amount: 6000 }] }, expected), false);
  assert.equal(linePayConfirmed({ ...info, transactionType: 'REFUND' }, expected), false);
});

test('checks a LINE authentication state with a signed GET and keeps transaction ID exact', async () => {
  let method, calledUrl, authorization;
  const result = await linePayGet({
    channelId: '1654237984', secret: 'test-secret', environment: 'test',
    path: '/v4/payments/requests/2023042201206549310/check',
    fetcher: async (url, options) => {
      calledUrl = url; method = options.method; authorization = options.headers['X-LINE-Authorization'];
      return new Response('{"returnCode":"0110","info":{"transactionId":2023042201206549310}}');
    },
  });
  assert.equal(method, 'GET');
  assert.equal(calledUrl, 'https://sandbox-api-pay.line.me/v4/payments/requests/2023042201206549310/check');
  assert.ok(authorization);
  assert.equal(result.info.transactionId, '2023042201206549310');
});

test('signs GET query text without the URL question mark', async () => {
  const path = '/v4/payments?transactionId=2026102002389324510';
  const secret = 'test-secret';
  let calledUrl, headers;
  await linePayGet({
    channelId: '1654237984', secret, environment: 'test', path,
    fetcher: async (url, options) => {
      calledUrl = url; headers = options.headers;
      return new Response('{"returnCode":"0000","info":[]}');
    },
  });
  const expected = createHmac('sha256', secret).update(
    secret + '/v4/payments' + 'transactionId=2026102002389324510' +
    headers['X-LINE-Authorization-Nonce'],
  ).digest('base64');
  assert.equal(calledUrl, 'https://sandbox-api-pay.line.me' + path);
  assert.equal(headers['X-LINE-Authorization'], expected);
});

test('only a verified authenticated confirmation redirect can request capture', () => {
  assert.equal(linePayNextStep('0000', 'line_confirm'), 'wait');
  assert.equal(linePayNextStep('0110', 'line_cancel'), 'wait');
  assert.equal(linePayNextStep('0110', 'line_confirm'), 'confirm');
  assert.equal(linePayNextStep('0121', 'line_confirm'), 'cancel');
  assert.equal(linePayNextStep('0122', 'line_confirm'), 'fail');
  assert.equal(linePayNextStep('0123', 'line_confirm'), 'reconcile');
});
