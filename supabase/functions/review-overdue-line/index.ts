import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Batch={batch_id:string;church_id:string;line_subject:string;message:string};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

Deno.serve(async request=>{
  if(request.method!=='POST')return reply(405,{ok:false});
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return reply(503,{ok:false,error:'config'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const secret=request.headers.get('x-cron-secret')||'';
  if(!secret)return reply(401,{ok:false});
  const checked=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});
  if(checked.error||checked.data!==true)return reply(401,{ok:false});
  const claimed=await db.rpc('claim_overdue_review_reminders',{p_limit:300});
  if(claimed.error)return reply(503,{ok:false,error:'claim_failed'});
  let sent=0,retry=0,permanent=0,cancelled=0;
  for(const batch of (claimed.data||[]) as Batch[]){
    const active=await db.rpc('review_reminder_batch_still_pending',{p_batch_id:batch.batch_id});
    if(active.error)return reply(503,{ok:false,error:'recheck_failed',sent,retry,permanent,cancelled});
    if(active.data!==true){
      const stopped=await db.from('review_reminder_batches').update({status:'cancelled'}).eq('id',batch.batch_id).eq('status','pending');
      if(stopped.error)return reply(503,{ok:false,error:'cancel_failed',sent,retry,permanent,cancelled});
      cancelled++;continue;
    }
    const token=batch.church_id==='SHiNE'
      ?Deno.env.get('LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||''
      :Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
    if(!token){retry++;continue;}
    let code=0;
    try{
      const response=await fetch('https://api.line.me/v2/bot/message/push',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-line-retry-key':batch.batch_id},
        body:JSON.stringify({to:batch.line_subject,messages:[{type:'text',text:batch.message}]})
      });
      code=response.status;
    }catch{code=0;}
    const status=code===200||code===409?'sent':code>=400&&code<500?'failed_permanent':'pending';
    const saved=await db.from('review_reminder_batches').update({status,attempts:1,
      sent_at:status==='sent'?new Date().toISOString():null,
      last_error:status==='sent'?null:code?`line_http_${code}`:'line_unavailable'})
      .eq('id',batch.batch_id).eq('status','pending');
    if(saved.error)return reply(503,{ok:false,error:'receipt_failed',sent,retry,permanent,cancelled});
    if(status==='sent')sent++;else if(status==='pending')retry++;else permanent++;
  }
  return reply(200,{ok:true,sent,retry,permanent,cancelled});
});
