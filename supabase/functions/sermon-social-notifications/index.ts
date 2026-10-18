import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffApp} from '../_shared/app-push-notification.mjs';
import {deliverReviewChannels} from './delivery.mjs';

const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

Deno.serve(async req=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',secret=req.headers.get('x-cron-secret')||'';
 if(!url||!key||!secret)return json(401,{ok:false,error:'unauthorized'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),valid=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});
 if(valid.error||valid.data!==true)return json(401,{ok:false,error:'unauthorized'});
 const due=await db.from('sermon_social_notification_queue').select('*').eq('status','pending').lte('deliver_after',new Date().toISOString()).order('deliver_after').limit(20);
 if(due.error)return json(503,{ok:false,error:'queue_read_failed'});
 let sent=0,failed=0;
 for(const item of due.data||[]){
  const claimed=await db.from('sermon_social_notification_queue').update({status:'processing',attempt_count:Number(item.attempt_count||0)+1,updated_at:new Date().toISOString()}).eq('id',item.id).eq('status','pending').select('id').maybeSingle();
  if(!claimed.data)continue;
  try{
   const draft=await db.from('sermon_social_drafts').select('status,review_stage').eq('id',item.draft_id).maybeSingle();
   if(draft.error)throw new Error('draft_read_failed');
   const active=item.stage==='initial_review'?draft.data?.status==='pending_review'&&draft.data?.review_stage==='initial_review':item.stage==='pastoral_confirmation'?draft.data?.status==='pending_review'&&draft.data?.review_stage==='pastoral_confirmation':true;
   if(!active){await db.from('sermon_social_notification_queue').update({status:'sent',sent_at:new Date().toISOString(),error_code:'stage_superseded',updated_at:new Date().toISOString()}).eq('id',item.id);continue;}
   const previous=await db.from('pastoral_notification_deliveries').select('app_status,line_status,sent_at').eq('idempotency_key',item.source_key).maybeSingle();
   if(previous.error)throw new Error('delivery_read_failed');
   const delivered=await deliverReviewChannels({
    db,item,previous:previous.data||{},notifyApp:notifyStaffApp,
    lineToken:Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||''
   });
   const now=new Date().toISOString();
   const error=delivered.complete?null:'app:'+delivered.appStatus+';line:'+delivered.lineStatus;
   const saved=await db.from('pastoral_notification_deliveries').upsert({
    entity_key:'mplus',notification_type:'sermon_social_review',recipient_staff_id:item.staff_id,
    related_id:item.draft_id,idempotency_key:item.source_key,status:delivered.complete?'sent':'failed',
    error_code:error,app_status:delivered.appStatus,line_status:delivered.lineStatus,
    sent_at:previous.data?.sent_at||(['sent'].includes(delivered.appStatus)||delivered.lineStatus==='sent'?now:null),updated_at:now
   },{onConflict:'idempotency_key'});
   if(saved.error)throw saved.error;
   const progress=await db.from('sermon_social_notification_queue').update({
    app_status:delivered.appStatus,line_status:delivered.lineStatus,
    app_sent_at:delivered.appStatus==='sent'?(item.app_sent_at||(previous.data?.app_status==='sent'?previous.data.sent_at:null)||now):item.app_sent_at,
    line_sent_at:delivered.lineStatus==='sent'?(item.line_sent_at||(previous.data?.line_status==='sent'?previous.data.sent_at:null)||now):item.line_sent_at,
    updated_at:now
   }).eq('id',item.id);
   if(progress.error)throw progress.error;
   console.info('sermon_review_delivery',{queue_id:item.id,app_status:delivered.appStatus,line_status:delivered.lineStatus,line_request_id:delivered.lineRequestId});
   if(!delivered.complete)throw new Error(error||'notification_incomplete');
   await db.from('sermon_social_notification_queue').update({status:'sent',sent_at:now,error_code:null,updated_at:now}).eq('id',item.id);
   sent++;
  }catch(error){
   const message=error instanceof Error?error.message:'notification_failed';
   const retry=Number(item.attempt_count||0)<2;
   await db.from('sermon_social_notification_queue').update({status:retry?'pending':'failed',deliver_after:retry?new Date(Date.now()+5*60*1000).toISOString():item.deliver_after,error_code:message.slice(0,500),updated_at:new Date().toISOString()}).eq('id',item.id);
   failed++;
  }
 }
 return json(200,{ok:true,processed:sent+failed,sent,failed});
});
