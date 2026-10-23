import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
let handler,mode='success',sent=0,checks=0;const calls=[],id='71000000-0000-4000-8000-000000000010';
const ok=value=>{assert(value);checks++;},originalFetch=globalThis.fetch;
globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://project.example.invalid':'synthetic-key'},serve:fn=>handler=fn};
globalThis.testimonyWorkerClient=()=>({rpc:async(name,args)=>{calls.push({name,args});if(name==='pastoral_validate_care_cron_secret')return {data:args.p_secret==='valid'};if(args.p_action==='claim')return mode==='claim-fail'?{error:{message:'fixture'}}:{data:[{id,submission_id:id,stage:'initial',staff_id:id,lease_id:id,line_subject:'U'+'a'.repeat(32)}]};return mode==='ack-fail'?{error:{message:'fixture'}}:{data:{saved:true}};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{is_active:mode!=='inactive'}})};return q;}});
globalThis.fetch=async(_url,options)=>{sent++;ok(JSON.parse(options.body).messages[0].text.includes('submission='+id));return new Response('{}',{status:200});};
try{
 let source=stripTypeScriptTypes(await fs.readFile(new URL('../../supabase/functions/testimony-review-notifications/index.ts',import.meta.url),'utf8'));
 source=source.replace(/import \{createClient\} from '[^']+';/,'const createClient=globalThis.testimonyWorkerClient;').replace("'./delivery.mjs'",JSON.stringify(new URL('../../supabase/functions/testimony-review-notifications/delivery.mjs',import.meta.url).href));
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const request=(secret,method='POST')=>handler(new Request('https://project.example.invalid/worker',{method,headers:secret?{'x-cron-secret':secret}:{}}));
 ok((await request('valid','GET')).status===405);ok((await request('')).status===401);ok((await request('wrong')).status===401);ok(sent===0);
 let result=await request('valid');ok((await result.json()).sent===1);ok(calls.at(-1).args.p_input.result==='sent');
 mode='claim-fail';ok((await request('valid')).status===503);ok(sent===1);
 mode='inactive';result=await request('valid');ok((await result.json()).failed===1);ok(sent===1);ok(calls.at(-1).args.p_input.result==='failed');
 mode='ack-fail';result=await request('valid');ok((await result.json()).sent===0);ok(sent===2);
 console.log('PASS',checks,'notification worker checks');
}finally{globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.testimonyWorkerClient;}
