import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {deliverTestimonyReview} from './delivery.mjs';
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async(req)=>{
 if(req.method!=='POST')return reply(405,{ok:false});
 const secret=req.headers.get('x-cron-secret')||'';if(!secret)return reply(401,{ok:false});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});if(auth.error||auth.data!==true)return reply(401,{ok:false});
 const claim=await db.rpc('testimony_notification_jobs',{p_action:'claim',p_input:{}});if(claim.error||!Array.isArray(claim.data))return reply(503,{ok:false});
 let sent=0,failed=0;
 for(const item of claim.data){
  const staff=await db.from('pastoral_staff').select('is_active').eq('id',item.staff_id).eq('is_active',true).maybeSingle();
  let result:{status:string;error?:string}={status:'failed',error:'staff_unavailable'};
  if(!staff.error&&staff.data?.is_active===true)result=await deliverTestimonyReview({item,lineSubject:item.line_subject,lineToken:Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||''});
  const saved=await db.rpc('testimony_notification_jobs',{p_action:'finish',p_input:{id:item.id,lease_id:item.lease_id,result:result.status,error:result.error||null}});
  if(saved.error||saved.data?.saved!==true){failed++;console.error('testimony_delivery_ack_failed',{queue_id:item.id});continue;}
  if(result.status==='sent')sent++;else failed++;
 }
 return reply(200,{ok:true,sent,failed});
});
