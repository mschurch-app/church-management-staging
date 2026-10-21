import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/migrations/20261021054456_finance_cash_foundation.sql', import.meta.url), 'utf8');
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  worker: '22222222-2222-4222-8222-222222222222',
  spouse: '33333333-3333-4333-8333-333333333333',
  pastor: '44444444-4444-4444-8444-444444444444',
  outsider: '55555555-5555-4555-8555-555555555555'
};

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema church_auth;
    create table church_auth.accounts(user_id uuid primary key,is_active boolean not null);
    create table church_auth.grants(user_id uuid,church_id text,permission text);
    create table church_auth.owners(user_id uuid primary key);
    create table public.members(id bigint primary key,church_id text not null,archived_at timestamptz);
  `);
  await db.exec(sql);
  for (const id of Object.values(ids)) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('insert into church_auth.accounts(user_id,is_active) values($1,true)', [id]);
  }
  await db.query('insert into church_auth.owners(user_id) values($1)', [ids.owner]);
  for (const id of [ids.owner, ids.worker, ids.spouse, ids.pastor]) {
    await db.query("insert into church_auth.grants(user_id,church_id,permission) values($1,'M+','members')", [id]);
  }
  await db.query("insert into public.members(id,church_id) values(1,'M+'),(2,'SHiNE')");
  await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'entry',$3),($2,'entry',$3),($4,'cash_verify',$3),($5,'approve',$3)", [ids.owner, ids.worker, ids.owner, ids.spouse, ids.pastor]);
  return db;
}

const payload = () => ({
  offeringDate: '2026-10-18', counterUserIds: [ids.owner, ids.worker], countedCash: 1500,
  bags: [
    { bagName: '王小明', memberId: 1, offeringCode: '0013', declaredTotal: 1200,
      lines: [{ category: '十一奉獻', amount: 1000 }, { category: '感恩奉獻', amount: 200 }] },
    { bagName: '匿名', anonymous: true, declaredTotal: 300,
      lines: [{ category: '一般／不具名奉獻', amount: 300 }] }
  ]
});

test('資料庫原子儲存逐袋奉獻，退回後保留版本並重新審核', async () => {
  const db = await setup();
  try {
    await db.query('select public.finance_assign_member_code($1,1,$2)', [ids.owner, '0013']);
    const created = await db.query('select public.finance_save_cash_batch($1,null,null,$2::jsonb) as result', [ids.owner, JSON.stringify(payload())]);
    let state = created.rows[0].result;
    assert.equal(state.enteredTotal, 1500);
    assert.equal(state.status, 'draft');
    const save = async (action, actor, verified = null, reason = null) => {
      const result = await db.query('select public.finance_transition_cash_batch($1,$2,$3,$4,$5,$6) as result', [actor, state.id, state.version, action, verified, reason]);
      state = result.rows[0].result;
    };
    await save('submit', ids.owner);
    await assert.rejects(save('approve', ids.pastor), /invalid_transition/);
    await save('return', ids.spouse, null, '袋額需校對');
    const resubmitted = await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result', [ids.owner, state.id, state.version, JSON.stringify(payload())]);
    state = resubmitted.rows[0].result;
    await save('submit', ids.owner);
    await save('verify_cash', ids.spouse, 1500);
    await save('approve', ids.pastor);
    assert.equal(state.status, 'booked');
    const events = await db.query('select action,version from public.finance_cash_events where batch_id=$1 order by version', [state.id]);
    assert.deepEqual(events.rows.map(row => row.action), ['created','submitted','returned','saved','submitted','cash_verified','approved']);
  } finally { await db.close(); }
});

test('會員編號不符或總額不符時整筆回滾；未指派的人員不能建立', async () => {
  const db = await setup();
  try {
    await db.query('select public.finance_assign_member_code($1,1,$2)', [ids.owner, '0013']);
    const wrongCode = payload(); wrongCode.bags[0].offeringCode = '0099';
    await assert.rejects(db.query('select public.finance_save_cash_batch($1,null,null,$2::jsonb)', [ids.owner, JSON.stringify(wrongCode)]), /member_code_mismatch/);
    const wrongAmount = payload(); wrongAmount.bags[0].declaredTotal = 1100;
    await assert.rejects(db.query('select public.finance_save_cash_batch($1,null,null,$2::jsonb)', [ids.owner, JSON.stringify(wrongAmount)]), /bag_total_mismatch/);
    await assert.rejects(db.query('select public.finance_save_cash_batch($1,null,null,$2::jsonb)', [ids.outsider, JSON.stringify(payload())]), /forbidden/);
    const count = await db.query('select count(*)::int as count from public.finance_cash_batches');
    assert.equal(count.rows[0].count, 0);
  } finally { await db.close(); }
});
