import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/sermon-social-notifications/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const deliveries=[],notified=[];
const due={id:'queue',draft_id:'draft',staff_id:'reviewer',stage:'initial_review',source_key:'once',title:'講道 IG 內容等待初審',body:'2026-08-09｜浪子回頭',target_url:'/sermon-social-review.html?draft=draft',attempt_count:0};
function query(value){const chain={};for(const method of ['select','eq','lte','order','limit'])chain[method]=()=>chain;chain.maybeSingle=async()=>({data:value,error:null});chain.then=resolve=>Promise.resolve({data:value,error:null}).then(resolve);chain.update=patch=>{if(patch.status)deliveries.push({queueStatus:patch.status});return chain;};return chain;}
const db={rpc:async()=>({data:true,error:null}),from(table){if(table==='sermon_social_notification_queue')return query([due]);if(table==='sermon_social_drafts')return query({status:'pending_review',review_stage:'initial_review'});if(table==='pastoral_notification_deliveries')return {upsert:async row=>{deliveries.push(row);return {error:null};}};throw Error(table);}};
let handler;
const context={Deno:{serve:fn=>{handler=fn;},env:{get:()=> 'configured'}},createClient:()=>db,notifyStaffApp:async args=>{notified.push(args);return {status:'sent'};},Date,Response,JSON,Number,String,Error};
vm.runInNewContext(stripTypeScriptTypes(source),context);
const response=await handler({method:'POST',headers:{get:()=> 'valid'}}),result=await response.json();
assert.equal(result.sent,1);
assert.equal(notified.length,1);
assert.equal(notified[0].staffId,'reviewer');
assert.equal(deliveries.find(row=>row.notification_type==='sermon_social_review').line_status,'disabled');
