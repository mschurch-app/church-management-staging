import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import {storePhoto} from './newcomer-photo-store.mjs';
import {makeNewcomerHandler} from './newcomer-http.mjs';
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const enabled=url==='https://aqanuwilmvdtlzuqlrau.supabase.co'&&!!key&&Deno.env.get('NEWCOMER_ENABLED')!=='false';
const db=enabled?createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}}):null;
async function preparePhoto(value,input){
 if(typeof value!=='string'||value.length>330000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value))throw Error('invalid_photo');
 const bytes=Uint8Array.from(atob(value.slice(value.indexOf(',')+1)),x=>x.charCodeAt(0));
 const raw=jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:1,maxMemoryUsageInMB:32});
 if(raw.width>960||raw.height>960)throw Error('invalid_photo');
 // Re-encode pixels on the server; discard metadata and any trailing payload.
 const clean=jpeg.encode({width:raw.width,height:raw.height,data:raw.data},75).data;
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',clean))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {path:input.church+'/'+input.request_id+'/'+hash+'.jpg',bytes:clean};
}
async function notifyNewcomerCare(requestId:string){
 if(!db)return;
 try{
  const found=await db.from('pastoral_newcomer_care_cases').select('id,shared_task_id,assigned_staff_ids,first_contact_due_at,member:members(name)').eq('registration_request_id',requestId).maybeSingle();
  if(found.error||!found.data)return;
  const care=found.data;
  const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
  const due=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(care.first_contact_due_at));
  for(const recipientId of care.assigned_staff_ids||[]){
   const key='newcomer_care_created:'+care.id+':'+recipientId;
   const previous=await db.from('pastoral_notification_deliveries').select('status').eq('idempotency_key',key).maybeSingle();
   if(previous.error||previous.data?.status==='sent')continue;
   const person=await db.from('pastoral_staff').select('line_subject,is_active').eq('id',recipientId).eq('is_active',true).maybeSingle();
   let status='failed',errorCode:string|null=null;
   if(!token){status='not_configured';errorCode='channel_token_missing';}
   else if(!person.data||!/^U[0-9a-f]{32}$/i.test(person.data.line_subject||'')){errorCode='line_identity_missing';}
   else try{
    const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},
     body:JSON.stringify({to:person.data.line_subject,messages:[{type:'text',text:'有新朋友留下資料，請牧師或師母一起關心：'+(care.member?.name||'新朋友')+'。共同關懷任務已建立，請在 '+due+' 前由其中一位完成第一次聯絡。\n開啟同工工作台：https://liff.line.me/2011645391-VGkQRZ9d/workspace.html?tab=tasks'}]})});
    if(response.ok)status='sent';else errorCode='line_http_'+response.status;
   }catch{errorCode='line_unavailable';}
   await db.from('pastoral_notification_deliveries').upsert({entity_key:'mplus',notification_type:'newcomer_care_created',recipient_staff_id:recipientId,
    related_id:care.shared_task_id,idempotency_key:key,status,error_code:errorCode,sent_at:status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});
  }
 }catch{/* Keep the public registration successful; retrying the same request retries delivery. */}
}
Deno.serve(makeNewcomerHandler({enabled,preparePhoto,submit:async input=>{
 if(!db)throw Error('unavailable');
 const {data,error}=await db.rpc('register_staging_newcomer',{p_id:input.request_id,p_church:input.church,p_payload:input.payload});
 if(error)throw Error('unavailable');
 if(data!=='accepted')return data;
 // Register once before upload; retries use the same request and immutable path.
 // An interrupted upload stays retryable and never creates another member.
 if(input.photo)await storePhoto(db.storage,input.photo);
 await notifyNewcomerCare(input.request_id);
 return 'accepted';
}}));
