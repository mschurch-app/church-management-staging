/** Test-only connection guard. Never loads production connection environment. */
export function localTestDatabase(input, sourceEnv = {}) {
  const reject = () => { throw new Error('local_test_database_required'); };
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input)) reject();
  let url, database;
  try { url = new URL(input); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { reject(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^mail_assistant_test_[a-z0-9_]+$/.test(database) || url.search || url.hash) reject();
  // libpq accepts PGHOSTADDR in addition to host, so validating a URL alone
  // is not sufficient. Do not inherit PG*, PSQL*, service files or DATABASE_URL.
  const env = {};
  for (const name of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'TMPDIR', 'TMP', 'TEMP']) {
    if (typeof sourceEnv[name] === 'string') env[name] = sourceEnv[name];
  }
  Object.assign(env, {
    PGHOSTADDR: url.hostname === '[::1]' ? '::1' : '127.0.0.1',
    PGCONNECT_TIMEOUT: '3', PGSERVICEFILE: '/dev/null', PGPASSFILE: '/dev/null',
    PGSSLMODE: 'disable', PGGSSENCMODE: 'disable',
    PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=3000'
  });
  return { connection: url.href, database, env };
}
