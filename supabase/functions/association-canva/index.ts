import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {canvaClient} from '../_shared/canva-client.mjs';
const env=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CANVA_CLIENT_ID','CANVA_CLIENT_SECRET','CANVA_TOKEN_ENCRYPTION_KEY'].map(k=>[k,Deno.env.get(k)||'']));
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{try{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=req.headers.get('x-cron-secret')||'',checked=secret?await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret}):null;
 if(checked?.error||checked?.data!==true)return Response.json({ok:false,error:'forbidden'},{status:403});
 const body=await req.json();
 if(body.action==='connection-health')return Response.json({ok:true,...await canvaClient({db,env}).health()},{headers:{'cache-control':'no-store'}});
 return Response.json({ok:false,error:'invalid_input'},{status:400});
}catch(e){return Response.json({ok:false,error:e instanceof Error&&e.message.startsWith('canva_')?e.message:'canva_unavailable'},{status:503});}});
