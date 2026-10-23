import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
let checks=0;const ok=value=>{assert.ok(value);checks++;};
const RealDate=Date;class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-23T01:00:00Z']));}static now(){return new RealDate('2026-10-23T01:00:00Z').getTime();}}
function query(value,error=null){const chain={};for(const method of ['select','eq','gte','lt','order','limit'])chain[method]=()=>chain;chain.maybeSingle=async()=>({data:value,error});chain.then=(resolve,reject)=>Promise.resolve({data:value,error}).then(resolve,reject);return chain;}
async function load(name,dependencies){let handler;const source=(await readFile(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');const context={Date:FixedDate,Response,JSON,Number,String,Error,Object,Array,Intl,AbortSignal,console,Deno:{env:{get:()=> 'test-only-configuration'},serve:fn=>handler=fn},...dependencies};vm.runInNewContext(stripTypeScriptTypes(source),context);return handler;}
function request(body={},authenticated=true){return {method:'POST',headers:{get:key=>key==='x-cron-secret'&&authenticated?'test-only-secret':''},json:async()=>body};}
async function serviceCase(name,{claimed=true,line=true,personal=false}={}){
 const requests=[],app=[],rpcCalls=[];const db={from:table=>table==='service_schedules'?query([{service_date:'2026-10-25',speaker:'測試講員',worship_leader:'測試同工'}]):query({line_subject:'U'+'a'.repeat(32),is_active:true}),rpc:async(method,args)=>{rpcCalls.push({method,args});return {data:method.includes('get_')?'C'+'b'.repeat(32):method.includes('claim_')?claimed:true,error:null};}};
 const handler=await load(name,{createClient:()=>db,notificationRoute:async()=>({app:true,line}),notifyChurchApp:async args=>{app.push(args);return {status:'stored'};},createServiceSchedulePng:async()=>new Uint8Array([1]),uploadServiceSchedulePng:async()=> 'https://example.test/card.png',fetch:async(url,options={})=>{requests.push({url,body:options.body?JSON.parse(options.body):null});return new Response('{}',{status:200});}});
 const unauthorized=await handler(request({},false));ok(unauthorized.status===503);ok(requests.length===0);
 const response=await handler(request({source:'manual-test',...(personal?{recipientStaffId:'11111111-1111-4111-8111-111111111111'}:{})}));const result=await response.json();ok(response.status===200);
 const pushes=requests.filter(x=>x.url.endsWith('/message/push')),validations=requests.filter(x=>x.url.endsWith('/message/validate/push'));
 if(!claimed){ok(pushes.length===0);ok(result.skipped==='already_sent_or_processing');ok(app.length===0);return;}
 if(!line){ok(pushes.length===0);ok(result.channels.line==='disabled');ok(app.length===1);return;}
 ok(pushes.length===1);ok(validations.length===1);ok(pushes[0].body.messages.length===1);ok(pushes[0].body.messages[0].type==='image');ok(pushes[0].body.messages[0].originalContentUrl==='https://example.test/card.png');ok(!JSON.stringify(pushes[0].body).includes('可長按'));ok(result.cardCount===1);ok(app.length===1);ok(rpcCalls.some(x=>x.method.includes('finish_')&&x.args.succeeded===true));if(personal)ok(pushes[0].body.to==='U'+'a'.repeat(32));
}
for(const name of ['weekly-sunday-service-line-card','shine-weekly-sunday-service-line-card']){await serviceCase(name);await serviceCase(name,{claimed:false});await serviceCase(name,{line:false});}
await serviceCase('weekly-sunday-service-line-card',{personal:true});
async function summaryCase(rows,{queued=false,saveError=false,manual=true}={}){
 const saved=[],delivered=[];let aiRequests=0;const db={rpc:async()=>({data:true,error:null}),from:table=>{
  if(table==='line_group_summary_settings')return query({group_id:'C'+'b'.repeat(32),enabled:true});
  if(table==='line_group_discussion_messages')return query(rows);
  if(table==='line_group_daily_summaries')return {upsert:async row=>{saved.push(row);return {error:saveError?{message:'isolated write failure'}:null};}};
  throw Error('unexpected table '+table);
 }};
 const handler=await load('line-group-daily-summary',{createClient:()=>db,notifyChurchDual:async args=>{delivered.push(args);return {status:queued?'queued':'sent',appStatus:queued?'queued':'stored',lineStatus:queued?'queued':'sent'};},fetch:async()=>{aiRequests++;throw Error('No external model or LINE calls permitted in this test');}});
 const unauthorized=await handler(request({},false));ok(unauthorized.status===401);
 const response=await handler(request({summary_date:'2026-10-22',...(manual?{manual_summary:'明日請記得帶水壺。'}:{})})),result=await response.json();
 const text=rows.filter(x=>x.message_type==='text'&&String(x.message_text||'').trim());
 if(!text.length){ok(response.status===(saveError?503:200));ok(delivered.length===0);ok(aiRequests===0);ok(saved.length===1);ok(saved[0].status==='no_messages');ok(saved[0].summary_text==='');ok(saved[0].sent_at===null);if(!saveError)ok(result.skipped==='no_text_messages');}
 else{ok(response.status===200);ok(delivered.length===1);ok(delivered[0].eventKey==='line_group_summary');ok(delivered[0].lineMessage.includes('明日請記得帶水壺。'));ok(saved[0].status===(queued?'queued':'sent'));ok(queued?saved[0].sent_at===null:!!saved[0].sent_at);ok(aiRequests===0);}
}
await summaryCase([],{manual:false});await summaryCase([{message_type:'image',message_text:''}],{manual:false});await summaryCase([{message_type:'text',message_text:'  \n '}],{manual:false});await summaryCase([],{saveError:true,manual:false});
const text=[{message_type:'text',message_text:'明日帶水壺',sender_name:'測試同工',occurred_at:'2026-10-22T08:00:00Z'}];await summaryCase(text);await summaryCase(text,{queued:true});
console.log(JSON.stringify({checks,passed:true,liveLineMessagesSent:0,cloudModelCalls:0}));
