import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileLinePay } from './line-pay-reconcile.mjs';

const transactionId = '2026102002389324510';
const order = { status: 'created', merchant_order_no: 'HB27ABCDEFGHIJ', amount: 7000 };
const info = { transactionType: 'PAYMENT', orderId: order.merchant_order_no,
  transactionId, payInfo: [{ amount: 7000 }] };
const credentials = { channelId: '1', secret: 'hidden', environment: 'test' };

function setup({ codes = ['0110'], post = async () => info, recordError = null, detail = info } = {}) {
  const calls = [];
  const client = {
    get: async ({ path }) => {
      calls.push(path);
      if (path.startsWith('/v4/payments?')) return { returnCode: '0000', info: [detail] };
      return { returnCode: codes.shift() ?? '0123' };
    },
    post: async args => { calls.push(args.path); return post(args); },
  };
  const database = { rpc: async (name, args) => {
    calls.push(name);
    return name.endsWith('record_line_pay')
      ? { error: recordError, data: { status: 'paid' } }
      : { error: null, data: { status: args.p_state } };
  } };
  return { calls, client, database };
}
const run = (parts, current = order) => reconcileLinePay({ ...parts, order: current,
  transactionId, credentials, log: { error() {} } });

test('authorization confirms exactly once and records the matching payment', async () => {
  const parts = setup();
  assert.equal(await run(parts), 'paid');
  assert.deepEqual(parts.calls, [
    `/v4/payments/requests/${transactionId}/check`,
    `/v4/payments/${transactionId}/confirm`,
    'heat_camp_2027_record_line_pay',
  ]);
  const repeat = setup();
  assert.equal(await run(repeat, { ...order, status: 'paid' }), 'paid');
  assert.deepEqual(repeat.calls, []);
});

test('retries from LINE details after confirmation succeeds but the response times out', async () => {
  const parts = setup({ codes: ['0110', '0123'], post: async () => { throw Error('timeout'); } });
  assert.equal(await run(parts), 'paid');
  assert.ok(parts.calls.includes(`/v4/payments?transactionId=${transactionId}`));
  assert.equal(parts.calls.at(-1), 'heat_camp_2027_record_line_pay');
});

test('a confirmed LINE payment can be recorded after an earlier database write failed', async () => {
  const failed = setup({ recordError: { message: 'database down' } });
  await assert.rejects(run(failed), /line_pay_paid_not_saved/);
  const recovered = setup({ codes: ['0123'] });
  assert.equal(await run(recovered), 'paid');
});

test('wait, cancel and mismatch never mark an order paid', async () => {
  const waiting = setup({ codes: ['0000', '0000'] });
  assert.equal(await run(waiting), 'awaiting_authorization');
  assert.ok(!waiting.calls.includes('heat_camp_2027_record_line_pay'));
  const cancelled = setup({ codes: ['0121'] });
  assert.equal(await run(cancelled), 'cancelled');
  assert.ok(!cancelled.calls.includes('heat_camp_2027_record_line_pay'));
  const mismatch = setup({ detail: { ...info, payInfo: [{ amount: 6999 }] }, codes: ['0123'] });
  await assert.rejects(run(mismatch), /line_pay_confirmation_mismatch/);
  assert.ok(!mismatch.calls.includes('heat_camp_2027_record_line_pay'));
});
