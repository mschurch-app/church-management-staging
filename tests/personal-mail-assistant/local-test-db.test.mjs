import test from 'node:test';
import assert from 'node:assert/strict';
import {localTestDatabase} from './local-test-db.mjs';
const valid = 'postgresql://postgres:synthetic@127.0.0.1:55432/mail_assistant_test_ci';
for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`accept explicit local test host ${host}`, () => {
    const result = localTestDatabase(`postgresql://${host}/mail_assistant_test_ci`);
    assert.equal(result.database, 'mail_assistant_test_ci');
    assert.equal(result.env.PGHOSTADDR, host === '[::1]' ? '::1' : '127.0.0.1');
  });
}
for (const input of [undefined, '', 'not-a-url',
  'postgresql://db.example.invalid/mail_assistant_test_ci',
  'postgresql://127.0.0.1/production',
  'postgresql://127.0.0.1/mail_assistant_test_ci?host=example.invalid',
  'postgresql://127.0.0.1/mail_assistant_test_ci#fragment',
  'postgresql://127.0.0.1/mail_assistant_test_%zz',
  'postgresql://127.0.0.1/mail_assistant_test_%2fother',
  'https://127.0.0.1/mail_assistant_test_ci',
  'postgresql://127.0.0.1/mail_assistant_test_ci\n']) {
  test(`reject unsafe connection ${String(input)}`, () => {
    assert.throws(() => localTestDatabase(input), /local_test_database_required/);
  });
}
test('strip ambient connection, service, psql and secret variables; pin loopback', () => {
  const source = {
    PATH: '/test/bin', HOME: '/test/home', LANG: 'C.UTF-8',
    PGHOSTADDR: '198.51.100.10', PGHOST: 'production.invalid',
    PGSERVICE: 'production', PGSERVICEFILE: '/production.conf',
    PGOPTIONS: '-c search_path=other', PGPASSWORD: 'not-for-this-test',
    PSQLRC: '/other.sql', DATABASE_URL: 'never-read', SUPABASE_SERVICE_ROLE_KEY: 'never-read'
  };
  const {env} = localTestDatabase(valid, source);
  assert.equal(env.PGHOSTADDR, '127.0.0.1');
  assert.equal(env.PGSERVICEFILE, '/dev/null');
  assert.equal(env.PGPASSFILE, '/dev/null');
  assert.equal(env.PGCONNECT_TIMEOUT, '3');
  assert.equal(env.PATH, '/test/bin');
  for (const name of ['PGHOST', 'PGSERVICE', 'PGPASSWORD', 'PSQLRC', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.equal(Object.hasOwn(env, name), false, name);
  }
  assert.match(env.PGOPTIONS, /statement_timeout=15000/);
  assert.equal(source.PGHOSTADDR, '198.51.100.10');
});
test('keep test connection credentials without copying them into environment', () => {
  const result = localTestDatabase(valid);
  assert.equal(result.connection, valid);
  assert.equal(Object.hasOwn(result.env, 'PGPASSWORD'), false);
});
