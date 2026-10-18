import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffApp} from '../_shared/app-push-notification.mjs';

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
   const active=item.stage==='initial_review'?draft.data?.status==='pending_review'&&draft.data?.review_stage==='initial_review':item.stage==='pastoral_confirmation'?draft.data?.status==='pending_review'&&draft.data?.review_stage==='pastoral_confirmation':true;
   if(!active){await db.from('sermon_social_notification_queue').update({status:'sent',sent_at:new Date().toISOString(),error_code:'stage_superseded',updated_at:new Date().toISOString()}).eq('id',item.id);continue;}
   const app=(await notifyStaffApp({db,staffId:item.staff_id,churchId:'M+',eventKey:'sermon_social_review',sourceKey:item.source_key,title:item.title,body:item.body,url:item.target_url})).status;
   const appDone=['sent','stored'].includes(app);
   const saved=await db.from('pastoral_notification_deliveries').upsert({entity_key:'mplus',notification_type:'sermon_social_review',recipient_staff_id:item.staff_id,related_id:item.draft_id,idempotency_key:item.source_key,status:appDone?'sent':'failed',error_code:appDone?null:`app:${app}`,app_status:appDone?'sent':app,line_status:'disabled',sent_at:appDone?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});
   if(saved.error)throw saved.error;
   if(!appDone)throw new Error(`app:${app}`);
   await db.from('sermon_social_notification_queue').update({status:'sent',sent_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('id',item.id);
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
