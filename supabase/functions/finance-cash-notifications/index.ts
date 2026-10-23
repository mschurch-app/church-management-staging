import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {deliverPendingCounterInvitations} from '../finance-cash/delivery.mjs';
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{ok:false});
 const secret=request.headers.get('x-cron-secret');if(!secret)return reply(401,{ok:false});
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const valid=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});if(valid.error||valid.data!==true)return reply(401,{ok:false});
 try{return reply(200,{ok:true,...await deliverPendingCounterInvitations(db,Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'')});}
 catch{return reply(503,{ok:false,code:'delivery_unavailable'});}
});
