import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Body={action?:unknown;church?:unknown;feature?:unknown;idToken?:unknown;accessToken?:unknown;image?:unknown;date?:unknown;note?:unknown;memberName?:unknown;slotId?:unknown;slotIds?:unknown;choices?:unknown;registrationId?:unknown;accept?:unknown;requestType?:unknown};
const churches=new Set(['M+','SHiNE']);
const features=new Set(['menu','today','help','weekly','love','devotional','service_signup']);
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

async function verifyLineAccessToken(accessToken:unknown){
  const channel=Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391';
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>8192)return null;
  try{
    const checked=await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,{redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!checked.ok)return null;
    const details=await checked.json();
    if(details.client_id!==channel||!Number.isFinite(details.expires_in)||details.expires_in<=0)return null;
    const response=await fetch('https://api.line.me/v2/profile',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${accessToken}`}});
    if(!response.ok)return null;
    const value=await response.json();
    if(typeof value.userId!=='string'||!/^U[0-9a-f]{32}$/.test(value.userId))return null;
    return {id:value.userId,name:clean(value.displayName,80)||'主內家人'};
  }catch{return null;}
}

async function signedImage(db:ReturnType<typeof createClient>,path:string){
  if(/^https:\/\//i.test(path))return path;
  const result=await db.storage.from('church-media-staging').createSignedUrl(path,3600);
  return result.data?.signedUrl||'';
}

async function notifySignupOffer(subject:unknown,registrationId:unknown,expiresAt:unknown){
  const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||'';
  if(typeof subject!=='string'||!token)return;
  const page='https://mscos.mchurch.online/service-signup.html';
  const expiry=typeof expiresAt==='string'?new Date(expiresAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'24 小時內';
  await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:subject,messages:[{type:'text',text:`主日服事有名額釋出，現在輪到你確認是否承接。請在 ${expiry} 前開啟登記頁，按下「接受候補邀請」才會保留名額。\n${page}`} ]})}).catch(()=>{});
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(request.method!=='POST'||!origins.has(origin))return respond(origin,{ok:false,error:'forbidden'},403);
  let body:Body={};try{body=await request.json();}catch{return respond(origin,{ok:false,error:'invalid_request'},400);}
  const church=clean(body.church,10),action=clean(body.action,30),feature=clean(body.feature,20);
  if(!churches.has(church))return respond(origin,{ok:false,error:'invalid_church'},400);
  const identity=await verifyLine(body.idToken)||await verifyLineAccessToken(body.accessToken);if(!identity)return respond(origin,{ok:false,error:'login_required'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return respond(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  if(action==='content'){
    if(!features.has(feature))return respond(origin,{ok:false,error:'invalid_feature'},400);
    if(feature==='menu')return respond(origin,{ok:true,profile:{name:identity.name}});
    if(feature==='service_signup'){
      if(church!=='M+')return respond(origin,{ok:false,error:'content_empty'},404);
      const identityArgs={p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id};
      const [result,changes]=await Promise.all([db.rpc('service_signup_member_view',identityArgs),db.rpc('service_signup_my_change_requests',identityArgs)]);
      if(result.error||changes.error)return respond(origin,{ok:false,error:'unavailable'},503);
      for(const offer of result.data?.issued_offers||[])await notifySignupOffer(offer.line_subject,offer.registration_id,offer.expires_at);
      return respond(origin,{ok:true,profile:{name:identity.name},...result.data,change_requests:changes.data||[]});
    }
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
    if(feature==='devotional'){
      if(church!=='M+')return respond(origin,{ok:false,error:'content_empty'},404);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
      const requested=clean(body.date,10)||today;
      if(!/^2027-\d{2}-\d{2}$/.test(requested))return respond(origin,{ok:false,error:'invalid_date'},400);
      if(requested>today)return respond(origin,{ok:true,profile:{name:identity.name},date:requested,launchPending:true});
      const [contentResult,progressResult]=await Promise.all([
        db.from('daily_devotionals').select('devotional_date,weekday,month_theme,tree_stage,week_theme,devotional_title,selected_scripture_reference,roots_reading,branches_reading,fruit_reading,chapter_count,scripture_text,scripture_is_excerpt,scripture_version,context_summary,key_points,reflection_questions,life_application,response_prayer').eq('church_id',church).eq('devotional_date',requested).eq('review_status','approved').lte('published_at',new Date().toISOString()).maybeSingle(),
        db.from('daily_devotional_progress').select('devotional_date,completed_at,reflection_note').eq('church_id',church).eq('line_subject',identity.id).order('devotional_date'),
      ]);
      if(contentResult.error||progressResult.error)return respond(origin,{ok:false,error:'unavailable'},503);
      if(!contentResult.data)return respond(origin,{ok:false,error:'content_empty'},404);
      return respond(origin,{ok:true,profile:{name:identity.name},date:requested,item:contentResult.data,progress:progressResult.data||[]});
    }
    const scenarioResult=await db.from('love_share_scenarios').select('name,icon,sort_order').eq('church_id',church).eq('is_active',true).order('sort_order').limit(100);
    if(scenarioResult.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const scenarios=scenarioResult.data||[],names=scenarios.map(row=>row.name);
    if(!names.length)return respond(origin,{ok:true,profile:{name:identity.name},scenarios:[],items:[]});
    const result=await db.from('share_greeting_cards').select('id,category,title,image_url,share_caption,created_at').eq('church_id',church).eq('is_active',true).in('category',names).order('created_at',{ascending:false}).limit(120);
    if(result.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const order=new Map(scenarios.map((row,index)=>[row.name,index])),sorted=(result.data||[]).sort((a,b)=>(order.get(a.category)??999)-(order.get(b.category)??999));
    const items=await Promise.all(sorted.map(async row=>({...row,image_url:await signedImage(db,row.image_url)})));
    return respond(origin,{ok:true,profile:{name:identity.name},scenarios,items});
  }

  if(action==='service_signup_register'){
    const memberName=clean(body.memberName,80);
    if(church!=='M+'||!memberName||!Number.isSafeInteger(Number(body.slotId))||Number(body.slotId)<1)return respond(origin,{ok:false,error:!memberName?'member_name_required':'invalid_request'},400);
    const result=await db.rpc('service_signup_register_batch',{p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id,p_member_name:memberName,p_slots:[Number(body.slotId)]});
    if(result.error){
      const error=String(result.error.message||'');
      if(error.includes('binding_required'))return respond(origin,{ok:false,error:'binding_required'},403);
      if(error.includes('member_name_mismatch'))return respond(origin,{ok:false,error:'member_name_mismatch'},400);
      if(error.includes('one_service_per_sunday'))return respond(origin,{ok:false,error:'one_service_per_sunday'},409);
      if(error.includes('slot_unavailable'))return respond(origin,{ok:false,error:'slot_unavailable'},409);
      return respond(origin,{ok:false,error:'unavailable'},503);
    }
    return respond(origin,{ok:true,registration:result.data?.registrations?.[0]||null});
  }

  if(action==='service_signup_register_batch'){
    const memberName=clean(body.memberName,80),choices=Array.isArray(body.choices)?body.choices:[];
    const allowedRoles=new Set(['sound','projection_director','lighting','worship_leader','assistant_worship_leader','keyboard','drums','guitar','bass','singer','welcome','children_teacher','children_assistant']);
    const validChoices=choices.length>=1&&choices.length<=60&&choices.every(choice=>choice&&typeof choice==='object'&&allowedRoles.has(clean((choice as {role_key?:unknown}).role_key,40))&&/^20\d{2}-\d{2}-\d{2}$/.test(clean((choice as {service_date?:unknown}).service_date,10)));
    if(church!=='M+'||!memberName||!validChoices)return respond(origin,{ok:false,error:!memberName?'member_name_required':'invalid_request'},400);
    const safeChoices=choices.map(choice=>({role_key:clean((choice as {role_key?:unknown}).role_key,40),service_date:clean((choice as {service_date?:unknown}).service_date,10)}));
    const result=await db.rpc('service_signup_register_preference_batch',{p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id,p_member_name:memberName,p_choices:safeChoices});
    if(result.error){
      const error=String(result.error.message||'');
      if(error.includes('binding_required'))return respond(origin,{ok:false,error:'binding_required'},403);
      if(error.includes('member_name_required'))return respond(origin,{ok:false,error:'member_name_required'},400);
      if(error.includes('member_name_mismatch'))return respond(origin,{ok:false,error:'member_name_mismatch'},400);
      if(error.includes('one_service_per_sunday')||error.includes('duplicate_service_date'))return respond(origin,{ok:false,error:'one_service_per_sunday'},409);
      if(error.includes('slot_unavailable'))return respond(origin,{ok:false,error:'slot_unavailable'},409);
      return respond(origin,{ok:false,error:'unavailable'},503);
    }
    return respond(origin,{ok:true,...result.data});
  }

  if(action==='service_signup_cancel'){
    if(church!=='M+'||!Number.isSafeInteger(Number(body.registrationId))||Number(body.registrationId)<1)return respond(origin,{ok:false,error:'invalid_request'},400);
    const result=await db.rpc('service_signup_cancel_or_request',{p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id,p_registration:Number(body.registrationId)});
    if(result.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const offer=result.data?.next_offer;
    if(offer)await notifySignupOffer(offer.line_subject,offer.registration_id,offer.expires_at);
    return respond(origin,{ok:true,...result.data});
  }

  if(action==='service_signup_change_request'){
    const registration=Number(body.registrationId),requestType=clean(body.requestType,20),note=clean(body.note,600);
    if(church!=='M+'||!Number.isSafeInteger(registration)||registration<1||!['cancel','adjust'].includes(requestType)||note.length<2)return respond(origin,{ok:false,error:'invalid_request'},400);
    const result=await db.rpc('service_signup_submit_change_request',{p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id,p_registration:registration,p_request_type:requestType,p_note:note});
    if(result.error){const error=String(result.error.message||'');return respond(origin,{ok:false,error:error.includes('direct_change_allowed')?'direct_change_allowed':error.includes('duplicate key')?'request_exists':'unavailable'},error.includes('duplicate key')?409:400);}
    return respond(origin,{ok:true,...result.data});
  }

  if(action==='service_signup_offer'){
    const registration=Number(body.registrationId),accept=body.accept===true;
    if(church!=='M+'||!Number.isSafeInteger(registration)||registration<1)return respond(origin,{ok:false,error:'invalid_request'},400);
    const result=await db.rpc('service_signup_accept_offer',{p_church:church,p_channel:Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391',p_subject:identity.id,p_registration:registration,p_accept:accept});
    if(result.error){const error=String(result.error.message||'');return respond(origin,{ok:false,error:error.includes('binding_required')?'binding_required':error.includes('offer_expired')?'offer_expired':'unavailable'},error.includes('offer_expired')?409:503);}
    const next=result.data?.next_offer;
    if(next)await notifySignupOffer(next.line_subject,next.registration_id,next.expires_at);
    return respond(origin,{ok:true,...result.data});
  }

  if(action==='devotional_complete'){
    if(church!=='M+')return respond(origin,{ok:false,error:'invalid_church'},400);
    const date=clean(body.date,10),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),note=clean(body.note,1000);
    if(!/^2027-\d{2}-\d{2}$/.test(date)||date>today)return respond(origin,{ok:false,error:'invalid_date'},400);
    const available=await db.from('daily_devotionals').select('devotional_date').eq('church_id',church).eq('devotional_date',date).eq('review_status','approved').lte('published_at',new Date().toISOString()).maybeSingle();
    if(available.error)return respond(origin,{ok:false,error:'unavailable'},503);
    if(!available.data)return respond(origin,{ok:false,error:'content_empty'},404);
    const saved=await db.from('daily_devotional_progress').upsert({church_id:church,line_subject:identity.id,devotional_date:date,completed_at:new Date().toISOString(),reflection_note:note||null,note_updated_at:note?new Date().toISOString():null},{onConflict:'church_id,line_subject,devotional_date'}).select('devotional_date,completed_at,reflection_note').single();
    if(saved.error)return respond(origin,{ok:false,error:'unavailable'},503);
    return respond(origin,{ok:true,record:saved.data});
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
