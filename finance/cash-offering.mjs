// Shared, side-effect-free checks for the Sunday cash workflow. The API must
// repeat these checks in a database transaction and persist the returned event.
export const CASH_STATES = Object.freeze(['draft', 'spouse_review', 'pastor_review', 'booked', 'returned']);
const categories = new Set(['十一奉獻', '感恩奉獻', '宣教奉獻', '建堂奉獻', '慈惠奉獻','兒童主日學奉獻', '指定奉獻', '一般／不具名奉獻']);
const actions = Object.freeze({
  submit: { from: ['draft', 'returned'], to: 'spouse_review', capability: 'offering_entry' },
  verify_cash: { from: ['spouse_review'], to: 'pastor_review', capability: 'cash_verify' },
  approve: { from: ['pastor_review'], to: 'booked', capability: 'offering_approve' },
  return_from_spouse: { from: ['spouse_review'], to: 'returned', capability: 'cash_verify' },
  return_from_pastor: { from: ['pastor_review'], to: 'returned', capability: 'offering_approve' }
});

function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }

export function validateCashBag(bag) {
  if (!bag || !String(bag.bagName ?? '').trim()) throw new Error('每筆須有奉獻者姓名或匿名標示。');
  if (!Number.isInteger(bag.sequence) || bag.sequence < 1) throw new Error('袋序號不正確。');
  if (bag.memberId != null && (!bag.offeringCode || !/^\d{4}$/.test(bag.offeringCode))) {
    throw new Error('已建檔會友須有四位奉獻編號。');
  }
  if (bag.identityResolved === false) throw new Error('奉獻者姓名與奉獻編號不一致，請先釐清。');
  if (!Array.isArray(bag.lines) || bag.lines.length === 0) throw new Error('每筆須有奉獻分類及金額。');
  let total = 0;
  for (const line of bag.lines) {
    if (!categories.has(line.category) || !positiveInteger(line.amount)) throw new Error('奉獻分類或金額不正確。');
    if (line.category === '指定奉獻' && !String(line.designation ?? '').trim()) throw new Error('指定奉獻須填用途。');
    if (line.category === '一般／不具名奉獻' && bag.anonymous !== true) throw new Error('一般／不具名奉獻只用於匿名款。');
    total += line.amount;
    if (!Number.isSafeInteger(total)) throw new Error('袋合計超出可計算範圍。');
  }
  return total;
}

export function validateCashBatch(batch) {
  if (!batch || !/^\d{4}-\d{2}-\d{2}$/.test(batch.offeringDate ?? '') || batch.projectId !== 'mplus') {
    throw new Error('當週奉獻日期或堂會不正確。');
  }
  const counters = batch.counterUserIds;
  if (!Array.isArray(counters) || counters.length !== 2 || !counters[0] || !counters[1] || counters[0] === counters[1]) {
    throw new Error('須有兩位不同的點收同工。');
  }
  if (!Array.isArray(batch.bags) || batch.bags.length === 0) throw new Error('至少登錄一袋或一筆匿名現金。');
  const sequences = new Set();
  let total = 0;
  for (const bag of batch.bags) {
    if (sequences.has(bag.sequence)) throw new Error('同一筆當週奉獻紀錄的袋序號不可重複。');
    sequences.add(bag.sequence);
    total += validateCashBag(bag);
    if (!Number.isSafeInteger(total)) throw new Error('當週奉獻金額超出可計算範圍。');
  }
  if (batch.enteredTotal !== total) throw new Error('奉獻登錄合計與各袋加總不符。');
  if (batch.countedCash !== total) throw new Error('現金實點總額與奉獻登錄合計不符。');
  return total;
}

export function advanceCashBatch(batch, action, actor, { reason = '', now = new Date().toISOString() } = {}) {
  const rule = actions[action];
  if (!rule || !rule.from.includes(batch?.status)) throw new Error('目前狀態不能執行此操作。');
  if (!actor?.id || actor.capability !== rule.capability) throw new Error('操作者沒有此步驟權限。');
  if (action.startsWith('return') && !String(reason).trim()) throw new Error('退回須填寫原因。');
  if (action === 'submit' || action === 'verify_cash' || action === 'approve') validateCashBatch(batch);
  if (action === 'submit' && batch.bags.some(bag=>!bag.confirmedBy||!bag.confirmedAt)) throw new Error('各筆奉獻須由一位同工確認。');
  if (action === 'submit' && !batch.counterUserIds.every(id => batch.counterConfirmations?.some(item => item.userId === id && item.confirmedAt))) {
    throw new Error('兩位點收同工都須親自確認後，才能送複審。');
  }
  if (action === 'verify_cash' && batch.spouseVerifiedCash !== batch.countedCash) {
    throw new Error('師母核對現金與同工點收不符。');
  }
  const event = {
    from: batch.status,
    to: rule.to,
    action,
    actorId: actor.id,
    at: now,
    ...(reason ? { reason: String(reason).trim() } : {})
  };
  return { ...batch, ...(action.startsWith('return') ? { counterConfirmations: [] } : {}), status: rule.to, version: (batch.version ?? 0) + 1, events: [...(batch.events ?? []), event] };
}
