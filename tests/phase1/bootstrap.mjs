import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const fixture=name=>new URL(name,import.meta.url);
const migration=new URL('../../supabase/migrations/20261009150001_verified_accounts_atomic_save.sql',import.meta.url);
export async function database(){
 const db=new PGlite();
 const checked=async sql=>{try{return await db.exec(sql);}catch(e){console.error("SQL context",sql.slice(Number(e.position)-100,Number(e.position)+100));throw e;}};
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema church_auth;
 create table auth.users(id uuid primary key,email text); create table auth.identities(user_id uuid references auth.users,provider text,provider_id text,identity_data jsonb);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth,church_auth to authenticated; grant execute on function auth.uid(),auth.jwt() to authenticated;
 create table public.members(id bigint primary key); create table public.app_notifications(user_id uuid,event_key text,source_key text,read_at timestamptz);
 create table public.review_workflow_settings(church_id text,workflow_key text,workflow_label text,initial_reviewer_id uuid,final_reviewer_id uuid,notify_app boolean,notify_line boolean,updated_by uuid,updated_at timestamptz,primary key(church_id,workflow_key));`);
 const schema=JSON.parse(fs.readFileSync(fixture('schema.json'),'utf8'));
 for(const name of [...new Set(schema.columns.map(c=>c.table_name))]){
  const cols=schema.columns.filter(c=>c.table_name===name).map(c=>`"${c.column_name}" ${c.data_type==='ARRAY'?'text[]':c.data_type} ${c.is_nullable==='NO'?'not null':''} ${c.column_default?'default '+c.column_default:''}`);
  await db.exec(`create table church_auth.${name}(${cols.join(',')})`);
 }
 for(const [i,c] of schema.constraints.entries())await db.exec(`alter table ${c.table} add constraint fixture_constraint_${i} ${c.def}`);
 await checked(fs.readFileSync(fixture('baseline-functions.sql'),'utf8').replace(/(?<!AS )\$function\$\n/g,'$function$;\n'));
 await checked(fs.readFileSync(fixture('baseline-extra.sql'),'utf8').replace(/(?<!AS )\$function\$\n/g,'$function$;\n'));
 const staff=JSON.parse(fs.readFileSync(fixture('staff-schema.json'),'utf8'));
 for(const name of ['pastoral_staff','pastoral_staff_access']){const columns=staff.staff_schema.filter(c=>c.table_name===name).map(c=>`"${c.column_name}" ${c.data_type} ${c.is_nullable==='NO'?'not null':''} ${c.column_default?'default '+c.column_default:''}`);await db.exec(`create table public.${name}(${columns.join(',')})`);}
 for(const index of staff.staff_indexes)await db.exec(index);
 await checked(fs.readFileSync(fixture('staff-trigger.sql'),'utf8'));
 await checked(fs.readFileSync(migration,'utf8'));
 await checked(fs.readFileSync(new URL('../../supabase/migrations/20261009150002_account_audit_foreign_key_indexes.sql',import.meta.url),'utf8'));
 await checked(fs.readFileSync(new URL('../../supabase/migrations/20261009150003_canonical_line_login_capabilities.sql',import.meta.url),'utf8'));
 return db;
}
