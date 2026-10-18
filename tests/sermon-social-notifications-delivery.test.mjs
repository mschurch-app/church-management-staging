import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverReviewChannels} from '../supabase/functions/sermon-social-notifications/delivery.mjs';

const item={id:'609ddffe-f3a0-4be2-841b-633ab0afba16',stage:'initial_review',staff_id:'staff',source_key:'sermon-social-review:draft:staff',title:'初審通知',body:'今天的信息',target_url:'/sermon-social-review.html?draft=current'};
function db(route={app_enabled:true,line_enabled:true},person={line_subject:'U'+'a'.repeat(32),is_active:true}) {
 return {from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='notification_channel_routes'?route:person,error:null};}};}};
}
test('App already sent: backfill LINE once with exact review URL and stable retry key',async()=>{
 let app=0,line=0;
 const r=await deliverReviewChannels({db:db(),item,previous:{app_status:'sent',line_status:'disabled'},notifyApp:async()=>{app++;return {status:'sent'};},lineToken:'test-token',fetcher:async(url,o)=>{line++;assert.equal(url,'https://api.line.me/v2/bot/message/push');assert.equal(o.headers['X-Line-Retry-Key'],item.id);assert.match(JSON.parse(o.body).messages[0].text,/https:\/\/mscos.mchurch.online\/sermon-social-review.html\?draft=current/);return new Response('{}',{status:200,headers:{'x-line-request-id':'request1'}});}});
 assert.equal(app,0);assert.equal(line,1);assert.equal(r.lineStatus,'sent');assert.equal(r.complete,true);
});
test('both sent: retries send neither channel',async()=>{
 const never=async()=>{throw new Error('duplicate');};
 const r=await deliverReviewChannels({db:db(),item,previous:{app_status:'sent',line_status:'sent'},notifyApp:never,fetcher:never,lineToken:'test-token'});
 assert.equal(r.complete,true);
});
test('pastor initial status copy stays App only',async()=>{
 let app=0,line=0;
 const r=await deliverReviewChannels({db:db(),item:{...item,source_key:'sermon-social-initial-status:draft:pastor'},notifyApp:async()=>{app++;return {status:'stored'};},fetcher:async()=>{line++;throw Error('must not send');},lineToken:'test-token'});
 assert.equal(app,1);assert.equal(line,0);assert.equal(r.lineStatus,'disabled');assert.equal(r.complete,true);
});
test('pastoral confirmation stays App only even when the initial review route is dual',async()=>{
 let app=0,line=0;
 const r=await deliverReviewChannels({db:db(),item:{...item,stage:'pastoral_confirmation'},previous:{},notifyApp:async()=>{app++;return {status:'stored'};},fetcher:async()=>{line++;throw Error('final review must not send LINE');},lineToken:'test-token'});
 assert.equal(app,1);assert.equal(line,0);assert.equal(r.appStatus,'sent');assert.equal(r.lineStatus,'disabled');assert.equal(r.complete,true);
});
test('LINE failure leaves notification incomplete and preserves successful App',async()=>{
 const r=await deliverReviewChannels({db:db(),item,previous:{app_status:'sent'},notifyApp:async()=>{throw Error('duplicate App');},lineToken:'test-token',fetcher:async()=>new Response('{}',{status:429})});
 assert.equal(r.appStatus,'sent');assert.equal(r.lineStatus,'http_429');assert.equal(r.complete,false);
});
test('accepted retry 409 is recorded as sent, other 409 is failure',async()=>{
 const shared={db:db(),item,previous:{app_status:'sent'},notifyApp:async()=>{throw Error('duplicate App');},lineToken:'test-token'};
 const accepted=await deliverReviewChannels({...shared,fetcher:async()=>new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'original'}})});
 assert.equal(accepted.lineStatus,'sent');assert.equal(accepted.lineRequestId,'original');
 const rejected=await deliverReviewChannels({...shared,fetcher:async()=>new Response('{}',{status:409})});
 assert.equal(rejected.complete,false);
});
test('disabled LINE route is honored',async()=>{
 const r=await deliverReviewChannels({db:db({app_enabled:true,line_enabled:false}),item,previous:{app_status:'sent'},notifyApp:async()=>{throw Error('duplicate App');},lineToken:'test-token',fetcher:async()=>{throw Error('disabled LINE');}});
 assert.equal(r.lineStatus,'disabled');assert.equal(r.complete,true);
});
test('missing recipient identity is a failure, not a sent receipt',async()=>{
 const r=await deliverReviewChannels({db:db(undefined,{line_subject:null,is_active:true}),item,previous:{app_status:'sent'},notifyApp:async()=>{throw Error('duplicate App');},lineToken:'test-token',fetcher:async()=>{throw Error('missing recipient');}});
 assert.equal(r.lineStatus,'identity_missing');assert.equal(r.complete,false);
});

