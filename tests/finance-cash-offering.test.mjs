import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCashBatch, validateCashBatch } from '../finance/cash-offering.mjs';

const sample = () => ({
  status: 'draft', version: 1, projectId: 'mplus', offeringDate: '2026-10-18',
  counterConfirmations: ['worker-a','worker-b'].map(userId=>({userId,confirmedAt:'2026-10-21T13:00:00Z'})),
  counterUserIds: ['worker-a', 'worker-b'], enteredTotal: 1500, countedCash: 1500,
  bags: [
    { sequence: 1, bagName: '王小明', memberId: 1, offeringCode: '0013', identityResolved: true, declaredTotal: 1200,
      lines: [{ category: '十一奉獻', amount: 1000 }, { category: '感恩奉獻', amount: 200 }] },
    { sequence: 2, bagName: '匿名', anonymous: true, declaredTotal: 300,
      lines: [{ category: '一般／不具名奉獻', amount: 300 }] }
  ]
});

test('逐袋、批次與現金三方金額必須相符', () => {
  assert.equal(validateCashBatch(sample()), 1500);
  const mismatch = sample();
  mismatch.countedCash = 1400;
  assert.throws(() => validateCashBatch(mismatch), /現金實點總額/);
  const identity = sample();
  identity.bags[0].identityResolved = false;
  assert.throws(() => validateCashBatch(identity), /姓名與奉獻編號/);
});

test('同工、師母、牧師依序核准；退回後重新核對並留版本紀錄', () => {
  const worker = { id: 'worker-a', capability: 'offering_entry' };
  const spouse = { id: 'spouse', capability: 'cash_verify' };
  const pastor = { id: 'pastor', capability: 'offering_approve' };
  const submitted = advanceCashBatch(sample(), 'submit', worker);
  assert.throws(() => advanceCashBatch(submitted, 'approve', pastor));
  const returned = advanceCashBatch(submitted, 'return_from_spouse', spouse, { reason: '袋額需校對' });
  assert.equal(returned.events.at(-1).reason, '袋額需校對');
  assert.throws(()=>advanceCashBatch(returned,'submit',worker),/兩位點收/);
  const resubmitted = advanceCashBatch({...returned,counterConfirmations:sample().counterConfirmations}, 'submit', worker);
  const verified = advanceCashBatch({ ...resubmitted, spouseVerifiedCash: 1500 }, 'verify_cash', spouse);
  const booked = advanceCashBatch(verified, 'approve', pastor);
  assert.equal(booked.status, 'booked');
  assert.equal(booked.version, 6);
  assert.equal(booked.events.length, 5);
});
