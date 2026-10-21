// Produces public-only offering data. The caller must supply booked donations
// from the authorized server-side ledger, never a browser-side member query.
export const OFFERING_CATEGORIES = Object.freeze([
  '十一奉獻', '感恩奉獻', '宣教奉獻', '建堂奉獻', '慈惠奉獻', '指定奉獻', '一般／不具名奉獻'
]);

const categorySet = new Set(OFFERING_CATEGORIES);

export function normalizeOfferingCode(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,4}$/.test(raw) || Number(raw) === 0) throw new Error('奉獻編號須為 0001 至 9999。');
  return raw.padStart(4, '0');
}

export function maskMiddleName(value) {
  const characters = Array.from(String(value ?? '').trim());
  if (characters.length < 2) throw new Error('臨時姓名不足以安全遮蔽，請改為不列出。');
  if (characters.length === 2) return `${characters[0]}○`;
  return `${characters[0]}${'○'.repeat(characters.length - 2)}${characters.at(-1)}`;
}

function publicLabel(donation) {
  if (donation.hideFromBulletin === true || donation.publicChoice === 'unlisted') return null;
  if (donation.publicChoice === 'anonymous' || donation.anonymous === true) return '匿名';
  if (donation.memberId != null) return normalizeOfferingCode(donation.offeringCode);
  if (donation.publicChoice !== 'public') return null;
  return maskMiddleName(donation.bagName);
}

export function buildBulletinPreview(donations, { projectId, offeringDate } = {}) {
  if (!Array.isArray(donations) || !projectId || !/^\d{4}-\d{2}-\d{2}$/.test(offeringDate ?? '')) {
    throw new Error('週報產生條件不完整。');
  }
  const categoryTotals = Object.fromEntries(OFFERING_CATEGORIES.map(category => [category, 0]));
  const rows = [];
  const grouped = new Map();
  let hiddenTotal = 0;
  const seen = new Set();
  for (const donation of donations) {
    if (donation.projectId !== projectId || donation.offeringDate !== offeringDate) continue;
    if (donation.status !== 'booked') throw new Error('本週仍有未核准奉獻，週報暫緩發布。');
    if (!donation.id || seen.has(donation.id)) throw new Error('奉獻資料含重複或缺漏識別碼。');
    seen.add(donation.id);
    if (!categorySet.has(donation.category) || !Number.isSafeInteger(donation.amount) || donation.amount <= 0) {
      throw new Error('奉獻分類或金額不正確。');
    }
    if (donation.category === '指定奉獻' && !String(donation.designation ?? '').trim()) {
      throw new Error('指定奉獻缺少用途。');
    }
    categoryTotals[donation.category] += donation.amount;
    if (!Number.isSafeInteger(categoryTotals[donation.category])) throw new Error('奉獻金額超出可計算範圍。');
    const label = publicLabel(donation);
    if (label == null) {
      hiddenTotal += donation.amount;
      continue;
    }
    // Only verified member IDs may be merged; a matching masked name is not
    // evidence that two temporary donors are the same person.
    const groupingKey = donation.memberId == null ? `entry:${donation.id}` : `member:${donation.memberId}:${label}`;
    let row = grouped.get(groupingKey);
    if (!row) {
      row = { label, categoryAmounts: {}, designated: [], total: 0 };
      grouped.set(groupingKey, row);
      rows.push(row);
    } else if (row.label !== label) {
      throw new Error('同一會員的奉獻編號不一致，請先核對主檔。');
    }
    row.categoryAmounts[donation.category] = (row.categoryAmounts[donation.category] ?? 0) + donation.amount;
    row.total += donation.amount;
    if (!Number.isSafeInteger(row.total)) throw new Error('奉獻金額超出可計算範圍。');
    if (donation.category === '指定奉獻') {
      row.designated.push({ purpose: donation.designation.trim(), amount: donation.amount });
    }
  }
  const grandTotal = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(grandTotal) || !Number.isSafeInteger(hiddenTotal)) {
    throw new Error('奉獻總額超出可計算範圍。');
  }
  return {
    projectId,
    offeringDate,
    categoryTotals,
    grandTotal,
    hiddenTotal,
    rows
  };
}
