import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Body={action?:unknown;from?:unknown;to?:unknown;id?:unknown;toStatus?:unknown;comment?:unknown;values?:unknown};
const allowedOrigins=new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS')||'https://mscos.mchurch.online,http://127.0.0.1:8000,http://localhost:8000').split(',').map(v=>v.trim()).filter(Boolean));
const clean=(value:unknown,max=2000)=>String(value||'').trim().slice(0,max);
const headers=(origin:string)=>({'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'});
const json=(origin:string,value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return allowedOrigins.has(origin)?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false},403);
  if(request.method!=='POST'||!allowedOrigins.has(origin))return json(origin,{ok:false,error:'forbidden'},403);
  const authorization=request.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return json(origin,{ok:false,error:'login_required'},401);
  let body:Body={};try{body=await request.json();}catch{return json(origin,{ok:false,error:'invalid_request'},400);}
  const url=Deno.env.get('SUPABASE_URL')||'',publishable=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY')||'',secret=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!publishable||!secret)return json(origin,{ok:false,error:'unavailable'},503);
  const auth=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const [userResult,accessResult,permissionResult]=await Promise.all([auth.auth.getUser(),auth.rpc('get_my_church_access'),auth.rpc('get_my_feature_permissions',{p_church:'M+'})]);
  const user=userResult.data.user,hasGrant=Array.isArray(accessResult.data)&&accessResult.data.some((row:{church_id:string;permission:string})=>row.church_id==='M+'&&row.permission==='tree_reading_admin');
  if(userResult.error||!user||accessResult.error||permissionResult.error||!hasGrant)return json(origin,{ok:false,error:'forbidden'},403);
  const feature=Array.isArray(permissionResult.data)?permissionResult.data.find((row:{feature_key:string})=>row.feature_key==='tree_reading_admin'):null;
  if(feature?.view===false)return json(origin,{ok:false,error:'forbidden'},403);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),action=clean(body.action,30);
  if(action==='content_list'){
    const from=/^2027-\d{2}-\d{2}$/.test(clean(body.from,10))?clean(body.from,10):'2027-01-01',to=/^2027-\d{2}-\d{2}$/.test(clean(body.to,10))?clean(body.to,10):'2027-01-31';
    const result=await db.from('daily_devotionals').select('id,devotional_date,weekday,month_theme,week_theme,devotional_title,selected_scripture_reference,roots_reading,branches_reading,fruit_reading,scripture_text,scripture_is_excerpt,scripture_version,scripture_source,scripture_license_note,context_summary,key_points,reflection_questions,life_application,response_prayer,review_status,reviewed_by,reviewed_at,approved_by,approved_at,published_at,version').eq('church_id','M+').gte('devotional_date',from).lte('devotional_date',to).order('devotional_date');
    if(result.error)return json(origin,{ok:false,error:'unavailable'},503);return json(origin,{ok:true,items:result.data||[]});
  }
  if(feature?.approve===false&&['content_update','content_review'].includes(action))return json(origin,{ok:false,error:'forbidden'},403);
  const id=clean(body.id,50);if(!/^[0-9a-f-]{36}$/i.test(id))return json(origin,{ok:false,error:'invalid_request'},400);
  if(action==='content_update'){
    const source=body.values&&typeof body.values==='object'&&!Array.isArray(body.values)?body.values as Record<string,unknown>:null;if(!source)return json(origin,{ok:false,error:'invalid_request'},400);
    const allowed=['devotional_title','selected_scripture_reference','scripture_text','scripture_version','scripture_source','scripture_license_note','context_summary','key_points','reflection_questions','life_application','response_prayer'],values:Record<string,string>={};
    for(const key of allowed){const value=clean(source[key],key==='devotional_title'||key==='selected_scripture_reference'?300:5000);if(!value)return json(origin,{ok:false,error:'required_field'},400);values[key]=value;}
    const result=await db.rpc('update_daily_devotional_content',{p_id:id,p_editor:user.id,p_values:values});if(result.error)return json(origin,{ok:false,error:'update_failed'},409);return json(origin,{ok:true,item:result.data});
  }
  if(action==='content_review'){
    const toStatus=clean(body.toStatus,30),comment=clean(body.comment,1000);if(!['final_review','approved','returned'].includes(toStatus))return json(origin,{ok:false,error:'invalid_transition'},400);
    const result=await db.rpc('review_daily_devotional',{p_id:id,p_reviewer:user.id,p_to_status:toStatus,p_comment:comment||null});
    if(result.error){const message=String(result.error.message||'');const code=['different_reviewer_required','licensing_required','comment_required','invalid_transition'].find(value=>message.includes(value))||'review_failed';return json(origin,{ok:false,error:code},409);}return json(origin,{ok:true,item:result.data});
  }
  return json(origin,{ok:false,error:'invalid_action'},400);
});
