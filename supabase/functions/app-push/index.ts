import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import webpush from 'npm:web-push@3.6.7';

const cors={'access-control-allow-origin':'https://mscos.mchurch.online','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'};
const headers={...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
  try{
    const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const db=admin(),verified=await db.auth.getUser(token);
    if(verified.error||!verified.data.user)return json(401,{ok:false,error:'unauthorized'});
    const user=verified.data.user,body=await request.json().catch(()=>({}));
    if(body.action==='subscribe'){
      const subscription=body.subscription;
      if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return json(400,{ok:false,error:'invalid_subscription'});
      const saved=await db.from('app_push_subscriptions').upsert({user_id:user.id,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth_key:subscription.keys.auth,user_agent:String(body.user_agent||'').slice(0,500),is_active:true,last_used_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'endpoint'});
      if(saved.error)return json(503,{ok:false,error:'save_failed'});
      return json(200,{ok:true});
    }
    if(body.action==='test'){
      let publicKey=Deno.env.get('VAPID_PUBLIC_KEY')||'',privateKey=Deno.env.get('VAPID_PRIVATE_KEY')||'',subject=Deno.env.get('VAPID_SUBJECT')||'mailto:james@tcsc.org.tw';
      if(!publicKey||!privateKey){const stored=await db.rpc('get_app_push_vapid_config');if(!stored.error){publicKey=stored.data?.public_key||'';privateKey=stored.data?.private_key||'';subject=stored.data?.subject||subject;}}
      if(!publicKey||!privateKey)return json(503,{ok:false,error:'push_not_configured'});
      webpush.setVapidDetails(subject,publicKey,privateKey);
      const subscriptions=await db.from('app_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',user.id).eq('is_active',true);
      if(subscriptions.error)return json(503,{ok:false,error:'load_failed'});
      let sent=0;
      for(const item of subscriptions.data||[]){
        try{
          await webpush.sendNotification({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth_key}},JSON.stringify({title:'教會 OS 通知測試',body:'背景推播已連線成功。之後可接收新朋友、工作與服事提醒。',url:'/admin-dashboard.html',tag:'church-os-test'}));
          sent++;
        }catch(error){
          const status=Number((error as {statusCode?:number}).statusCode||0);
          if(status===404||status===410)await db.from('app_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',item.id);
        }
      }
      return sent?json(200,{ok:true,sent}):json(409,{ok:false,error:'no_active_device'});
    }
    return json(400,{ok:false,error:'unknown_action'});
  }catch{return json(503,{ok:false,error:'push_unavailable'});}
});
