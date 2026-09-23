import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Body={action?:unknown;church?:unknown;feature?:unknown;idToken?:unknown;image?:unknown};
const churches=new Set(['M+','SHiNE']);
const features=new Set(['menu','today','help','weekly','love']);
const origins=new Set((Deno.env.get('LINE_ALLOWED_ORIGINS')||'https://mscos.mchurch.online,https://mschurch-app.github.io,http://127.0.0.1:4180,http://localhost:4180').split(',').map(v=>v.trim()).filter(Boolean));
const cors=(origin:string)=>({'access-control-allow-origin':origins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type,apikey,authorization','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'});
const respond=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
const clean=(value:unknown,max=100)=>String(value||'').trim().slice(0,max);
const hash=(value:string)=>{let result=2166136261;for(let i=0;i<value.length;i++){result^=value.charCodeAt(i);result=Math.imul(result,16777619);}return result>>>0;};

async function verifyLine(idToken:unknown){
  const channel=Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391';
  if(typeof idToken!=='string'||!idToken||idToken.length>8192)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:idToken,client_id:channel})});
    if(!response.ok)return null;
    const value=await response.json(),now=Math.floor(Date.now()/1000);
    if(value.iss!=='https://access.line.me'||value.aud!==channel||!Number.isSafeInteger(value.exp)||value.exp<=now||typeof value.sub!=='string'||!/^U[0-9a-f]{32}$/.test(value.sub))return null;
    return {id:value.sub,name:clean(value.name,80)||'主內家人'};
  }catch{return null;}
}

async function signedImage(db:ReturnType<typeof createClient>,path:string){
  if(/^https:\/\//i.test(path))return path;
  const result=await db.storage.from('church-media-staging').createSignedUrl(path,3600);
  return result.data?.signedUrl||'';
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(request.method!=='POST'||!origins.has(origin))return respond(origin,{ok:false,error:'forbidden'},403);
  let body:Body={};try{body=await request.json();}catch{return respond(origin,{ok:false,error:'invalid_request'},400);}
  const church=clean(body.church,10),action=clean(body.action,30),feature=clean(body.feature,20);
  if(!churches.has(church))return respond(origin,{ok:false,error:'invalid_church'},400);
  const identity=await verifyLine(body.idToken);if(!identity)return respond(origin,{ok:false,error:'login_required'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return respond(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  if(action==='content'){
    if(!features.has(feature))return respond(origin,{ok:false,error:'invalid_feature'},400);
    if(feature==='menu')return respond(origin,{ok:true,profile:{name:identity.name}});
    if(feature==='today'){
      const result=await db.from('spiritual_cards').select('id,scripture,scripture_ref,prayer_text').eq('church_id',church).eq('category','給今天的你').eq('is_active',true).limit(500);
      if(result.error||!result.data?.length)return respond(origin,{ok:false,error:'content_empty'},404);
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),row=result.data[hash(`${church}:${identity.id}:${date}`)%result.data.length];
      return respond(origin,{ok:true,profile:{name:identity.name},date,item:row});
    }
    if(feature==='help'){
      const result=await db.from('spiritual_cards').select('id,category,scripture,scripture_ref,prayer_text').eq('church_id',church).eq('is_active',true).neq('category','給今天的你').order('category').limit(200);
      if(result.error)return respond(origin,{ok:false,error:'unavailable'},503);
      return respond(origin,{ok:true,profile:{name:identity.name},items:result.data||[]});
    }
    if(feature==='weekly'){
      const [gatherings,settings]=await Promise.all([db.from('weekly_gatherings').select('id,day_of_week,day_name,time,title,location,description').eq('church_id',church).order('day_of_week'),db.from('church_public_settings').select('service_info,address,map_url').eq('church_id',church).maybeSingle()]);
      if(gatherings.error)return respond(origin,{ok:false,error:'unavailable'},503);
      return respond(origin,{ok:true,profile:{name:identity.name},items:gatherings.data||[],settings:settings.data||{}});
    }
    const result=await db.from('share_greeting_cards').select('id,category,title,image_url,share_caption').eq('church_id',church).eq('is_active',true).order('created_at',{ascending:false}).limit(120);
    if(result.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const items=await Promise.all((result.data||[]).map(async row=>({...row,image_url:await signedImage(db,row.image_url)})));
    return respond(origin,{ok:true,profile:{name:identity.name},items});
  }

  if(action==='share_image'){
    const image=String(body.image||''),match=image.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if(!match)return respond(origin,{ok:false,error:'invalid_image'},400);
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
    if(bytes.length<1000||bytes.length>2621440)return respond(origin,{ok:false,error:'invalid_image'},413);
    const rate=await db.from('line_share_assets').select('id',{count:'exact',head:true}).eq('line_user_id',identity.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
    if(rate.error)return respond(origin,{ok:false,error:'unavailable'},503);
    if((rate.count||0)>=12)return respond(origin,{ok:false,error:'rate_limited'},429);
    const ext=match[1]==='png'?'png':'jpg',path=`${church}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
    const uploaded=await db.storage.from('line-share-cards').upload(path,bytes,{contentType:`image/${match[1]}`,upsert:false,cacheControl:'604800'});
    if(uploaded.error)return respond(origin,{ok:false,error:'upload_failed'},503);
    const recorded=await db.from('line_share_assets').insert({church_id:church,line_user_id:identity.id,object_path:path});
    if(recorded.error){await db.storage.from('line-share-cards').remove([path]);return respond(origin,{ok:false,error:'unavailable'},503);}
    const publicUrl=db.storage.from('line-share-cards').getPublicUrl(path).data.publicUrl;
    return respond(origin,{ok:true,url:publicUrl});
  }
  return respond(origin,{ok:false,error:'invalid_action'},400);
});
