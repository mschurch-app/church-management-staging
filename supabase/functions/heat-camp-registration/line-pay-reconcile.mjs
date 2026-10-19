import { linePayConfirmed, linePayNextStep } from './line-pay-api.mjs';

// Caller supplies the signed LINE client and service-role RPC client. The
// browser's redirect is never treated as proof of payment.
export async function reconcileLinePay({ order, transactionId, credentials, client, database, log = console }) {
  if (order.status === 'paid') return 'paid';
  if (order.status !== 'created') return 'failed';
  if (!/^[0-9]{16,22}$/.test(transactionId) ||
      !/^HB27[0-9A-Z]{10,22}$/.test(order.merchant_order_no)) {
    throw new Error('line_pay_order_mismatch');
  }

  const state = await client.get({ ...credentials, path: `/v4/payments/requests/${transactionId}/check` });
  const next = linePayNextStep(state.returnCode, 'line_confirm');
  if (next === 'cancel' || next === 'fail') {
    const closed = await database.rpc('heat_camp_2027_close_line_pay', {
      p_transaction_id: transactionId, p_state: next === 'cancel' ? 'cancelled' : 'failed',
    });
    if (closed.error) throw new Error('line_pay_close_not_saved');
    return closed.data?.status === 'paid' ? 'paid' : next === 'cancel' ? 'cancelled' : 'failed';
  }

  let info;
  if (next === 'confirm') {
    try {
      info = await client.post({ ...credentials, path: `/v4/payments/${transactionId}/confirm`,
        payload: { amount: order.amount, currency: 'TWD' } });
    } catch (error) {
      // The capture may have succeeded before the connection timed out.
      log.error('LINE Pay confirmation uncertain', { transactionId,
        message: error instanceof Error ? error.message : 'unknown' });
    }
  }
  if (!info) {
    const latest = next === 'reconcile' ? state :
      await client.get({ ...credentials, path: `/v4/payments/requests/${transactionId}/check` });
    if (latest.returnCode === '0123') {
      const details = await client.get({ ...credentials, path: `/v4/payments?transactionId=${transactionId}` });
      info = Array.isArray(details.info)
        ? details.info.find(entry => String(entry.transactionId) === transactionId) : null;
    }
  }
  if (!info) return state.returnCode === '0000' ? 'awaiting_authorization' : 'pending';
  if (!linePayConfirmed(info, { orderId: order.merchant_order_no, transactionId, amount: order.amount })) {
    throw new Error('line_pay_confirmation_mismatch');
  }
  const recorded = await database.rpc('heat_camp_2027_record_line_pay', {
    p_transaction_id: transactionId, p_info: info,
  });
  if (recorded.error) throw new Error('line_pay_paid_not_saved');
  return 'paid';
}
