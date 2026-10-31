import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffDual} from '../_shared/dual-notification.mjs';
const ID='2b45e43b-b2ef-46c6-ac5e-597db194b9e8',VERSION=25;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return json({ok:false},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const secret=request.headers.get('x-cron-secret')||'';
 if(!secret)return json({ok:false},401);
 const auth=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});if(auth.error||auth.data!==true)return json({ok:false},401);
 if(Date.now()>Date.parse('2026-11-02T00:00:00+08:00'))return json({ok:false,error:'expired'},410);
 const {data:row,error}=await db.from('website_weekly_bulletins').select('id,version,status,service_date').eq('id',ID).eq('church_id','M+').single();
 if(error||row.version!==VERSION||row.status!=='pending_review')return json({ok:false,error:'review_changed'},409);
 const recipients=await db.rpc('get_weekly_bulletin_reviewers',{p_church:'M+'});if(recipients.error)return json({ok:false},503);
 const url='/weekly-bulletin-review.html?church=M%2B&bulletin='+ID;
 const results=[];
 for(const person of recipients.data||[]){
  const key='weekly-preview-resend:'+ID+':'+VERSION+':'+person.id;
  const result=await notifyStaffDual({db,staffId:person.id,churchId:'M+',eventKey:'weekly_bulletin_review',routeKey:'weekly_bulletin_review',sourceKey:key,title:'11/1 週報已更新，請複審',body:'已改為完整週報預覽，下方可填寫複審意見，並核准或退回。',url,lineMessage:'11/1 週報已改為完整預覽，請牧師、師母複審。下方保留意見表格與核准／退回操作。\nhttps://mscos.mchurch.online'+url,idempotencyKey:key});
  const saved=await db.from('pastoral_notification_deliveries').upsert({entity_key:'mplus',notification_type:'weekly_bulletin_review',recipient_staff_id:person.id,related_id:ID,idempotency_key:key,status:result.status,app_status:result.appStatus,line_status:result.lineStatus,error_code:result.status==='sent'?null:'delivery_incomplete',sent_at:result.status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});
  results.push({name:person.display_name,...result,receipt:!saved.error});
 }
 return json({ok:results.length===2&&results.every(r=>r.receipt&&r.lineStatus==='sent'),results});
});
