import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBulletinPreview, maskMiddleName, normalizeOfferingCode } from '../finance/bulletin.mjs';

test('奉獻編號固定四位，姓名只留首尾', () => {
  assert.equal(normalizeOfferingCode(13), '0013');
  assert.equal(maskMiddleName('王小明'), '王○明');
  assert.equal(maskMiddleName('王明'), '王○');
  assert.throws(() => normalizeOfferingCode(10000));
});

test('M+ 所有來源均計入，非 M+ 排除；不露出者仍計總額', () => {
  const base = { offeringDate: '2026-10-18', projectId: 'mplus', status: 'booked' };
  const result = buildBulletinPreview([
    { ...base, id: 'cash', source: 'sunday_cash', memberId: 12, offeringCode: '13', category: '十一奉獻', amount: 1000 },
    { ...base, id: 'web', source: 'church_site', bagName: '王小明', publicChoice: 'public', category: '指定奉獻', designation: '兒童事工', amount: 500 },
    { ...base, id: 'association', source: 'association_site', anonymous: true, category: '感恩奉獻', amount: 300 },
    { ...base, id: 'hidden', source: 'sunday_cash', memberId: 16, offeringCode: '0016', hideFromBulletin: true, category: '感恩奉獻', amount: 200 },
    { ...base, id: 'other', projectId: 'other', source: 'association_site', category: '感恩奉獻', amount: 9999 }
  ], { projectId: 'mplus', offeringDate: '2026-10-18' });
  assert.deepEqual(result.rows, [
    { label: '0013', categoryAmounts: { '十一奉獻': 1000 }, designated: [], total: 1000 },
    { label: '王○明', categoryAmounts: { '指定奉獻': 500 }, designated: [{ purpose: '兒童事工', amount: 500 }], total: 500 },
    { label: '匿名', categoryAmounts: { '感恩奉獻': 300 }, designated: [], total: 300 }
  ]);
  assert.equal(result.grandTotal, 2000);
  assert.equal(result.hiddenTotal, 200);
  assert.equal(result.categoryTotals['感恩奉獻'], 500);
  assert.equal(JSON.stringify(result).includes('9999'), false);
});

test('同一會員跨袋跨管道合併；遮蔽姓名相同的未建檔者不合併', () => {
  const base = { offeringDate: '2026-10-18', projectId: 'mplus', status: 'booked' };
  const result = buildBulletinPreview([
    { ...base, id: '1', memberId: 7, offeringCode: '0007', category: '十一奉獻', amount: 100, source: 'sunday_cash' },
    { ...base, id: '2', memberId: 7, offeringCode: '0007', category: '感恩奉獻', amount: 200, source: 'association_site' },
    { ...base, id: '3', bagName: '王小明', publicChoice: 'public', category: '感恩奉獻', amount: 50 },
    { ...base, id: '4', bagName: '王大明', publicChoice: 'public', category: '感恩奉獻', amount: 70 }
  ], { projectId: 'mplus', offeringDate: '2026-10-18' });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[0].categoryAmounts, { '十一奉獻': 100, '感恩奉獻': 200 });
  assert.equal(result.rows[1].label, result.rows[2].label);
  assert.notEqual(result.rows[1].total, result.rows[2].total);
});

test('未核准奉獻阻擋週報；無公開意願的臨時捐款人只進總額', () => {
  const donation = { id: '1', projectId: 'mplus', offeringDate: '2026-10-18', category: '感恩奉獻', amount: 100, bagName: '陳小華' };
  assert.throws(() => buildBulletinPreview([{ ...donation, status: 'spouse_review' }], { projectId: 'mplus', offeringDate: '2026-10-18' }));
  const result = buildBulletinPreview([{ ...donation, status: 'booked' }], { projectId: 'mplus', offeringDate: '2026-10-18' });
  assert.equal(result.rows.length, 0);
  assert.equal(result.hiddenTotal, 100);
});

test('已建檔會友明確選匿名時不公開奉獻編號', () => {
  const result = buildBulletinPreview([{
    id: 'private-1', projectId: 'mplus', offeringDate: '2026-10-18', status: 'booked',
    memberId: 7, offeringCode: '0007', publicChoice: 'anonymous', category: '十一奉獻', amount: 500
  }], { projectId: 'mplus', offeringDate: '2026-10-18' });
  assert.deepEqual(result.rows.map(row => row.label), ['匿名']);
  assert.equal(JSON.stringify(result).includes('0007'), false);
});
