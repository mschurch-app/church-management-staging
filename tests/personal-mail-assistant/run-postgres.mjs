/** Explicit local-only runner. Never reads DATABASE_URL or connects to Supabase. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {localTestDatabase} from './local-test-db.mjs';
let target;
try { target = localTestDatabase(process.env.MAIL_ASSISTANT_TEST_DB || '', process.env); }
catch { console.error('Set MAIL_ASSISTANT_TEST_DB to a new, empty local PostgreSQL database named mail_assistant_test_<suffix>.'); process.exit(2); }
const load=path=>readFile(new URL(path,import.meta.url),'utf8');
const fixture=await load('./postgres-fixture.sql');
const draft=await load('../../supabase/isolated/personal-mail-assistant/phase2-draft.sql');
const checks=await load('./postgres-checks.sql');
const sql="BEGIN; SET LOCAL personal_mail.isolated_setup='enabled';\n"+fixture+'\n'+draft+'\n'+checks+'\nROLLBACK;\n';
const result=spawnSync('psql',['--no-psqlrc','--set','ON_ERROR_STOP=1','--dbname',target.connection],{input:sql,encoding:'utf8',timeout:30000,env:target.env});
if(result.error){console.error('Local PostgreSQL runner unavailable; no database tests executed.');process.exit(2);}
process.stdout.write(result.stdout || '');process.stderr.write(result.stderr || '');process.exit(result.status ?? 1);
