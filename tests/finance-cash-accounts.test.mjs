import test from 'node:test';
import assert from 'node:assert/strict';
import { financeAccounts, financeCanonicalTarget, financeWorkers } from '../supabase/functions/finance-cash/accounts.ts';

const line = '11111111-1111-4111-8111-111111111111';
const email = '22222222-2222-4222-8222-222222222222';
const sameName = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';

const verifiedRows = [
  { user_id: line, canonical_user_id: line, linked_user_ids: [email], display_name: '謝碧鳳', job_title: '師母', is_active: true, grants: [{ church_id: 'M+' }] },
  { user_id: sameName, canonical_user_id: sameName, linked_user_ids: [], display_name: '謝碧鳳', job_title: '師母', is_active: true, grants: [{ church_id: 'M+' }] },
  { user_id: other, canonical_user_id: other, linked_user_ids: [], display_name: '其他同工', job_title: '行政', is_active: true, grants: [{ church_id: 'SHiNE' }] }
];

test('已核對的 Email 與 LINE 合併為一張財務卡，舊角色仍顯示；同名未核對者維持分開', () => {
  const rows = financeAccounts(verifiedRows, [
    { user_id: email, role_key: 'cash_verify' },
    { user_id: line, role_key: 'entry' },
    { user_id: sameName, role_key: 'entry' }
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.userId === line), {
    userId: line, name: '謝碧鳳', title: '師母', roles: ['cash_verify', 'entry']
  });
  assert.deepEqual(rows.find(row => row.userId === sameName)?.roles, ['entry']);
});

test('權限指派只使用已核對身分的 canonical 帳號，無 M+ 權限者不列入', () => {
  assert.equal(financeCanonicalTarget(verifiedRows, line), line);
  assert.equal(financeCanonicalTarget(verifiedRows, email), line);
  assert.equal(financeCanonicalTarget(verifiedRows, sameName), sameName);
  assert.equal(financeCanonicalTarget(verifiedRows, other), null);
});

test('點收同工只列一次且顯示 canonical 人員姓名', () => {
  assert.deepEqual(financeWorkers(
    [{ user_id: line }, { user_id: line }, { user_id: sameName }],
    [{ app_user_id: line, display_name: '謝碧鳳' }, { app_user_id: sameName, display_name: '林同工' }]
  ), [
    { userId: line, name: '謝碧鳳' },
    { userId: sameName, name: '林同工' }
  ]);
});

test('財務會計分工的繼承登錄權限有來源標示，並與個別授權合併',()=>{
 const rows=financeAccounts(verifiedRows,[{user_id:line,role_key:'entry',source_key:'accounting_assignment'},{user_id:line,role_key:'entry',source_key:'individual'},{user_id:line,role_key:'approve',source_key:'individual'}]);
 assert.deepEqual(rows.find(r=>r.userId===line)?.roles,['entry','approve']);assert.deepEqual(rows.find(r=>r.userId===line)?.inheritedRoles,['entry']);assert.equal(rows.find(r=>r.userId===line)?.legacyEntry,true);
});
