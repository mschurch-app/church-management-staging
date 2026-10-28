import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const events=['leave_substitute','leave_review','leave_result'];
function fixture({route={app_enabled:true,line_enabled:true},previous=null,person={line_subject:'U'+'a'.repeat(32),is_active:true},status=200,unavailable=false}={}){
 const calls={app:[],line:[],routes:0};
 const db={from(table){if(table==='notification_channel_routes')calls.routes++;return {select(){return this;},eq(){return this;},async maybeSingle(){
  if(table==='notification_channel_routes')return {data:route,error:null};
  return {data:table==='pastoral_staff'?person:previous,error:null};
 }}}};
 const scope={Deno:{env:{get:()=> 'synthetic-test-token'}},AbortSignal,
  notifyStaffApp:async args=>{calls.app.push(args);return {status:'sent'};},notifyChurchApp:async()=>{throw Error('unexpected church send')},
  fetch:async(url,args)=>{calls.line.push({url,...JSON.parse(args.body)});if(unavailable)throw Error('offline');return {ok:status===200,status};}};
 const source=readFileSync(new URL('../supabase/functions/_shared/dual-notification.mjs',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replaceAll('export async function','async function');
 runInNewContext(source+'\nglobalThis.api={notificationRoute,notifyStaffDual};',scope);
 const send=(eventKey,churchId='M+')=>scope.api.notifyStaffDual({db,staffId:'synthetic-staff',churchId,eventKey,sourceKey:'synthetic',title:'合成請假測試',body:'請確認代理',url:'/pastoral/mplus-coworker-tools.html',lineMessage:'合成訊息與連結',idempotencyKey:'synthetic-only'});
 return {db,calls,api:scope.api,send};
}
for(const event of events){
 test(`${event}: legacy dual route sends LINE only`,async()=>{
  const h=fixture(),result=await h.send(event);
  assert.equal(result.appStatus,'disabled');assert.equal(result.lineStatus,'sent');
  assert.equal(result.status,'sent');assert.equal(h.calls.app.length,0);assert.equal(h.calls.line.length,1);
  assert.equal(h.calls.routes,0);
 });
 test(`${event}: SHiNE sends neither channel`,async()=>{
  const h=fixture(),result=await h.send(event,'SHiNE');
  assert.equal(result.appStatus,'disabled');assert.equal(result.lineStatus,'disabled');
  assert.equal(h.calls.app.length,0);assert.equal(h.calls.line.length,0);
 });
}
test('leave policy does not rely on available route rows',async()=>{
 const h=fixture({route:null});
 h.db.from=()=>{throw Error('route database unavailable');};
 const route=await h.api.notificationRoute(h.db,'M+','leave_review');
 assert.equal(route.app,false);assert.equal(route.line,true);
});
for(const [label,options,expected] of [
 ['LINE quota exceeded',{status:429},'http_429'],
 ['LINE network failure',{unavailable:true},'unavailable'],
 ['recipient not bound',{person:null},'identity_missing'],
])test(`${label} never falls back to App`,async()=>{
 const h=fixture(options),result=await h.send('leave_review');
 assert.equal(result.lineStatus,expected);assert.equal(result.status,'failed');
 assert.equal(h.calls.app.length,0);
});
test('a previously sent LINE notification is not resent after policy change',async()=>{
 const h=fixture({previous:{app_status:'sent',line_status:'sent'}}),result=await h.send('leave_result');
 assert.equal(result.appStatus,'disabled');assert.equal(result.lineStatus,'sent');
 assert.equal(h.calls.app.length,0);assert.equal(h.calls.line.length,0);
});
test('previous App delivery does not conceal failed LINE delivery',async()=>{
 const h=fixture({previous:{app_status:'sent',line_status:'http_429'},status:429}),result=await h.send('leave_result');
 assert.equal(result.status,'failed');assert.equal(h.calls.app.length,0);assert.equal(h.calls.line.length,1);
});
test('unrelated system events retain their configured App channel',async()=>{
 const h=fixture({route:{app_enabled:true,line_enabled:false}}),result=await h.send('system_status');
 assert.equal(result.appStatus,'sent');assert.equal(result.lineStatus,'disabled');
 assert.equal(h.calls.app.length,1);assert.equal(h.calls.line.length,0);assert.equal(h.calls.routes,1);
});
