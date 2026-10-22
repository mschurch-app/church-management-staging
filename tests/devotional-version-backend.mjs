import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {daily} from './phase3/fixtures.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tests/phase4/results/devotional-version-backend');await mkdir(out,{recursive:true});
const sql=async name=>readFile(path.join(root,'supabase/migrations',name),'utf8'),checks=[];
const check=(ok,name)=>{assert(ok,name);checks.push(name);console.log('PASS',name);};
const actor='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002',third='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004';
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');
 await db.query('insert into auth.users values($1),($2),($3)',[actor,second,third]);
 await db.exec((await sql('20261008090000_daily_devotional_2027_mvp.sql')).split('create or replace function public.update_daily_devotional_content(')[0]);
 await db.exec((await sql('20261008093000_daily_devotional_three_stage_review.sql')).split('insert into public.daily_devotional_reviewers')[0]);
 await db.query("insert into public.daily_devotional_reviewers(church_id,initial_reviewer_id,second_reviewer_id,final_reviewer_id) values('M+',$1,$2,$3)",[second,third,actor]);
 await db.exec(await sql('20261021112147_daily_devotional_2027_direct_approval.sql'));
 const migration=await sql('20261022144927_devotional_versioned_writes.sql');await db.exec(migration);await db.exec(migration);
 check(true,'migration applies and can be repeated without changing existing data');
 const fields=Object.fromEntries(['devotional_title','selected_scripture_reference','scripture_text','scripture_version','scripture_source','scripture_license_note','context_summary','key_points','reflection_questions','life_application','response_prayer'].map(k=>[k,daily()[0][k]]));
 const row={id,church_id:'M+',devotional_date:'2027-01-01',day_number:1,weekday:'五',month_theme:'合成月份',tree_stage:'roots',week_number:1,week_theme:'合成主題',roots_reading:'詩篇23',chapter_count:1,...fields,review_status:'initial_review'};
 await db.query(`insert into daily_devotionals(${Object.keys(row).join(',')}) values(${Object.keys(row).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
 const read=async()=> (await db.query('select * from daily_devotionals where id=$1',[id])).rows[0],audit=async()=>Number((await db.query('select count(*) as n from daily_devotional_reviews')).rows[0].n);
 const update=(version,values={devotional_title:'合成原子更新'})=>db.query('select * from public.update_daily_devotional_content_v2($1,$2,$3::jsonb,$4)',[id,actor,JSON.stringify(values),version]);
 const review=(version,status='approved',who=actor,note=null)=>db.query('select * from public.review_daily_devotional_v2($1,$2,$3,$4,$5)',[id,who,status,note,version]);
 await db.exec('set role service_role');await update(1);check((await read()).version===2&&(await audit())===1,'matching edit increments version and creates exactly one audit entry');
 await assert.rejects(update(1),/version_conflict/);check((await read()).version===2&&(await audit())===1,'stale edit changes neither content nor audit');
 await assert.rejects(update(null),/version_required/);await assert.rejects(update(0),/version_required/);check((await audit())===1,'missing and invalid expected versions are rejected by SQL itself');
 const before=await read();await assert.rejects(update(2,{private_key:'forbidden'}),/invalid_field/);check(JSON.stringify(await read())===JSON.stringify(before),'unknown fields roll back without changing a version');
 await update(2,{scripture_version:'',scripture_source:'',scripture_license_note:''});check((await read()).version===3&&(await read()).published_at===null&&(await read()).review_status==='approved','existing direct approval and licensing rules remain unchanged');
 await db.exec("reset role;update daily_devotionals set review_status='final_review' where id='"+id+"';set role service_role;");
 await assert.rejects(review(3,'approved',second),/wrong_reviewer/);await assert.rejects(review(3,'returned',actor,''),/comment_required/);check((await read()).version===3,'reviewer and required return comment rules remain enforced');
 await review(3,'returned',actor,'合成退回理由');check((await read()).version===4&&(await read()).review_status==='returned','return review increments the version exactly once');
 await assert.rejects(review(3),/version_conflict/);await review(4);check((await read()).version===5&&(await read()).review_status==='approved','stale review is refused and current review increments version');
 const race=await Promise.allSettled([update(5,{devotional_title:'合成甲'}),update(5,{devotional_title:'合成乙'})]);check(race.filter(r=>r.status==='fulfilled').length===1&&race.filter(r=>r.status==='rejected'&&/version_conflict/.test(r.reason.message)).length===1&&(await read()).version===6,'two requests with the same base version yield exactly one winner');
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(update(6),/permission denied/);await assert.rejects(review(6),/permission denied/);check(true,role+' cannot execute either v2 function');}
 await db.exec('reset role');const catalog=(await db.query("select proname,prosecdef,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('update_daily_devotional_content_v2','review_daily_devotional_v2')")).rows;
 check(catalog.length===2&&catalog.every(p=>!p.prosecdef&&p.proconfig.includes('search_path=public, pg_temp')),'new functions remain security invoker with fixed search path');
 const rls=(await db.query("select relrowsecurity from pg_class where relname in ('daily_devotionals','daily_devotional_reviews','daily_devotional_reviewers')")).rows;check(rls.length===3&&rls.every(x=>x.relrowsecurity),'existing RLS remains enabled');
 await db.exec("create function public.synthetic_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_failure';end$$;create trigger synthetic_audit_failure before insert on daily_devotional_reviews for each row execute function public.synthetic_audit_failure();set role service_role;");
 const snapshot=await read(),count=await audit();await assert.rejects(update(6),/synthetic_audit_failure/);check(JSON.stringify(await read())===JSON.stringify(snapshot)&&(await audit())===count,'audit failure atomically rolls back the content and version');
 await db.exec('reset role;drop trigger synthetic_audit_failure on daily_devotional_reviews;');

 // Run the real Edge handler. Only its SDK is replaced by isolated Auth and SQL clients.
 const source=await readFile(path.join(root,'supabase/functions/daily-devotional-admin/index.ts'),'utf8'),code=stripTypeScriptTypes(source.replace("import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';",''));
 let handler;const state={signedIn:true,grant:true,view:true,approve:true,rpcError:null,calls:[]};
 function from(table){const filters=[];let one=false;const q={select(){return q;},eq(k,v){filters.push([k,'=',v]);return q;},gte(k,v){filters.push([k,'>=',v]);return q;},lte(k,v){filters.push([k,'<=',v]);return q;},order(){return q;},single(){one=true;return q;},then(resolve,reject){return db.query('select * from '+table+(filters.length?' where '+filters.map(([k,op],i)=>k+op+'$'+(i+1)).join(' and '):''),filters.map(f=>f[2])).then(r=>resolve({data:one?r.rows[0]:r.rows,error:null}),reject);}};return q;}
 const sdk=(url,key)=>key==='isolated-service'?{from,rpc:async(name,args)=>{state.calls.push({name,args});if(state.rpcError)return{error:state.rpcError};try{await db.exec('set role service_role');const values=name==='update_daily_devotional_content_v2'?[args.p_id,args.p_editor,JSON.stringify(args.p_values),args.p_expected_version]:[args.p_id,args.p_reviewer,args.p_to_status,args.p_comment,args.p_expected_version];assert(['update_daily_devotional_content_v2','review_daily_devotional_v2'].includes(name));const r=await db.query('select * from public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values);return{data:r.rows[0],error:null};}catch(error){return{data:null,error:{message:error.message,code:error.code}};}}}:{auth:{getUser:async()=>({data:{user:state.signedIn?{id:actor}:null},error:null})},rpc:async name=>({data:name==='get_my_church_access'?(state.grant?[{church_id:'M+',permission:'tree_reading_admin'}]:[]):[{feature_key:'tree_reading_admin',view:state.view,approve:state.approve}],error:null})};
 vm.runInNewContext(code,{Deno:{serve:fn=>handler=fn,env:{get:k=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_ANON_KEY:'isolated-public',SUPABASE_SERVICE_ROLE_KEY:'isolated-service'}[k])}},createClient:sdk,Request,Response,AbortSignal,URL,console});
 async function call(body,origin='http://127.0.0.1:8000',authorization='Bearer synthetic'){const r=await handler(new Request('https://isolated.invalid',{method:'POST',headers:{origin,authorization,'content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,...await r.json()};}
 check((await call({action:'content_list'})).writeVersionContract==='devotional-version-v1','list response advertises the versioned write contract');
 for(const v of [undefined,null,'6',0,-1,1.5,2147483647]){const n=state.calls.length,r=await call({action:'content_update_v2',id,values:fields,expectedVersion:v});check(r.status===428&&r.error==='version_required'&&state.calls.length===n,'Edge rejects invalid expected version '+JSON.stringify(v)+' before any write RPC');}
 const legacyCount=state.calls.length;check((await call({action:'content_update',id,values:fields})).status===428&&state.calls.length===legacyCount,'legacy unversioned writes require a reload and never call SQL');
 const valid=await call({action:'content_update_v2',id,values:fields,expectedVersion:6,p_editor:second});check(valid.status===200&&valid.item.version===7&&state.calls.at(-1).args.p_editor===actor,'Edge forwards expected version and uses the verified actor rather than supplied identity');
 const stale=await call({action:'content_update_v2',id,values:fields,expectedVersion:6});check(stale.status===409&&stale.error==='version_conflict'&&(await read()).version===7,'real SQL conflict maps to HTTP 409 with no fallback overwrite');
 for(const property of ['signedIn','grant','view','approve']){state[property]=false;const n=state.calls.length,r=await call({action:'content_update_v2',id,values:fields,expectedVersion:7});check(r.status===403&&state.calls.length===n,'Edge rejects denied '+property+' before privileged SQL');state[property]=true;}
 check((await call({action:'content_update_v2',id,values:fields,expectedVersion:7},'https://other.invalid')).status===403,'unexpected origins cannot write');
 state.rpcError={code:'PGRST202',message:'function missing'};const unavailable=await call({action:'content_update_v2',id,values:fields,expectedVersion:7});check(unavailable.status===503&&unavailable.error==='schema_not_ready','missing migration fails closed without falling back to unversioned RPC');state.rpcError=null;
 const missing=await call({action:'content_update_v2',id:'00000000-0000-4000-8000-000000000099',values:fields,expectedVersion:7});check(missing.status===409&&missing.error==='not_found','deleted content is distinguished from retryable network failure');
 await db.exec('reset role');await db.query("update daily_devotionals set review_status='final_review' where id=$1",[id]);const reviewed=await call({action:'content_review_v2',id,toStatus:'approved',expectedVersion:7});check(reviewed.status===200&&reviewed.item.version===8,'Edge review uses the protected RPC and increments its version');const repeated=await call({action:'content_review_v2',id,toStatus:'approved',expectedVersion:7});check(repeated.status===409&&repeated.error==='version_conflict','stale review cannot append a second approval');
 await db.exec('reset role');await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,multiSessionPostgres:false},null,2));console.log('TOTAL',checks.length);
}finally{await db.close();}
