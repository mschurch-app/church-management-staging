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
    const db=admin(),body=await request.json().catch(()=>({}));
    if(body.action==='deliver-pending'){
      const secret=request.headers.get('x-cron-secret')||'',valid=secret?(await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret})).data===true:false;
      if(!valid)return json(401,{ok:false,error:'unauthorized'});
      let publicKey=Deno.env.get('VAPID_PUBLIC_KEY')||'',privateKey=Deno.env.get('VAPID_PRIVATE_KEY')||'',subject=Deno.env.get('VAPID_SUBJECT')||'mailto:james@tcsc.org.tw';
      if(!publicKey||!privateKey){const stored=await db.rpc('get_app_push_vapid_config');if(!stored.error){publicKey=stored.data?.public_key||'';privateKey=stored.data?.private_key||'';subject=stored.data?.subject||subject;}}
      if(!publicKey||!privateKey)return json(503,{ok:false,error:'push_not_configured'});
      webpush.setVapidDetails(subject,publicKey,privateKey);
      const pending=await db.from('app_notifications').select('id,user_id,title,body,target_url,source_key,push_attempt_count').is('push_sent_at',null).lt('push_attempt_count',6).order('created_at').limit(25);
      if(pending.error)return json(503,{ok:false,error:'load_failed'});
      let notifications=0,sent=0;
      for(const item of pending.data||[]){
        const subscriptions=await db.from('app_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',item.user_id).eq('is_active',true);
        let delivered=0,lastError=subscriptions.error?'subscription_load_failed':(subscriptions.data||[]).length?'delivery_failed':'no_active_device';
        for(const subscription of subscriptions.data||[])try{await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_key}},JSON.stringify({title:item.title,body:item.body,url:item.target_url,tag:item.source_key||item.id}));delivered++;}
        catch(error){const status=Number((error as {statusCode?:number}).statusCode||0);lastError=status?`push_${status}`:'push_failed';if(status===404||status===410)await db.from('app_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',subscription.id);}
        await db.from('app_notifications').update({push_sent_at:delivered?new Date().toISOString():null,push_attempt_count:Number(item.push_attempt_count||0)+1,push_last_error:delivered?null:lastError}).eq('id',item.id);
        notifications++;sent+=delivered;
      }
      return json(200,{ok:true,notifications,sent});
    }
    const verified=await db.auth.getUser(token);
    if(verified.error||!verified.data.user)return json(401,{ok:false,error:'unauthorized'});
    const user=verified.data.user;
    if(body.action==='request-admin-access-review'){
      const hasLine=(user.identities||[]).some(identity=>identity.provider==='custom:line-web');
      if(!hasLine)return json(403,{ok:false,error:'line_identity_required'});
      const name=String(user.user_metadata?.name||user.user_metadata?.display_name||'LINE 同工').trim().slice(0,60)||'LINE 同工';
      const owners=await db.rpc('get_app_push_owner_users');
      if(owners.error||!Array.isArray(owners.data)||!owners.data.length)return json(503,{ok:false,error:'owner_unavailable'});
      const sourceKey=`line-admin-access:${user.id}`;
      for(const ownerId of owners.data){
        const existing=await db.from('app_notifications').select('id').eq('user_id',ownerId).eq('event_key','admin_access_review').eq('source_key',sourceKey).maybeSingle();
        const payload={church_id:'M+',title:'同工 LINE 權限待審核',body:`${name} 已使用 LINE 登入，但尚未取得教會 OS 權限。請核對身分並設定事工權限。`,target_url:'/admin-accounts.html?church=M%2B',read_at:null,push_sent_at:null,push_attempt_count:0,push_last_error:null,created_at:new Date().toISOString()};
        if(existing.data)await db.from('app_notifications').update(payload).eq('id',existing.data.id);
        else await db.from('app_notifications').insert({user_id:ownerId,event_key:'admin_access_review',source_key:sourceKey,...payload});
      }
      return json(200,{ok:true,status:'queued',recipients:owners.data.length});
    }
    if(body.action==='subscribe'){
      const subscription=body.subscription;
      if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return json(400,{ok:false,error:'invalid_subscription'});
      const userAgent=String(body.user_agent||'').slice(0,500);
      if(userAgent)await db.from('app_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('user_agent',userAgent).neq('endpoint',subscription.endpoint);
      const saved=await db.from('app_push_subscriptions').upsert({user_id:user.id,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth_key:subscription.keys.auth,user_agent:userAgent,is_active:true,last_used_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'endpoint'});
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
