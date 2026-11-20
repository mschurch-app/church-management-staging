import {dispatchMemberCare} from './delivery.ts';
export function createHandler({createClient,env,fetcher=fetch}:any){
 const originSet=new Set(['https://mscos.mchurch.online','https://mschurch-app.github.io','http://127.0.0.1:4180','http://localhost:4180']);
 const channel=env('LINE_LOGIN_CHANNEL_ID')||'2011645391';
 const reply=(origin:string,status:number,data:any)=>new Response(JSON.stringify(data),{status,headers:{'access-control-allow-origin':originSet.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type,apikey,authorization','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'}});
 const validSubject=(sub:any)=>typeof sub==='string'&&/^U[0-9a-f]{32}$/.test(sub);
 async function identity(body:any){
  let unavailable=false;
  if(typeof body.idToken==='string'&&body.idToken.length>0&&body.idToken.length<=8192){try{const r=await fetcher('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:body.idToken,client_id:channel})});if(r.status===429||r.status>=500)unavailable=true;else if(r.ok){const c=await r.json(),now=Math.floor(Date.now()/1000);if(c.iss==='https://access.line.me'&&c.aud===channel&&Number.isSafeInteger(c.exp)&&c.exp>now&&Number.isSafeInteger(c.iat)&&c.iat<=now+60&&validSubject(c.sub))return {subject:c.sub};}}catch{unavailable=true;}}
  if(typeof body.accessToken==='string'&&body.accessToken.length>0&&body.accessToken.length<=8192){try{const r=await fetcher('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(body.accessToken),{redirect:'error',signal:AbortSignal.timeout(8000)});if(r.status===429||r.status>=500)unavailable=true;else if(r.ok){const v=await r.json();if(v.client_id===channel&&Number.isFinite(v.expires_in)&&v.expires_in>0){const p=await fetcher('https://api.line.me/v2/profile',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+body.accessToken}});if(p.status===429||p.status>=500)unavailable=true;else if(p.ok){const c=await p.json();if(validSubject(c.userId))return {subject:c.userId};}}}}catch{unavailable=true;}}
  return {error:unavailable?'line_unavailable':'login_required'};
 }
 return async(request:Request)=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return reply(origin,200,{ok:true});
  if(request.method==='POST'&&request.headers.get('x-cron-secret')){
   const url=env('SUPABASE_URL'),key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply(origin,503,{ok:false,error:'unavailable'});
   const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const check=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:request.headers.get('x-cron-secret')});if(check.error||check.data!==true)return reply(origin,401,{ok:false,error:'unauthorized'});
   let command:any={};try{command=await request.json();}catch{return reply(origin,400,{ok:false,error:'invalid_input'});}
   if(command.action==='route_check'){const setting=await db.from('line_group_summary_settings').select('group_id,enabled').eq('id',true).maybeSingle();const token=env('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||env('LINE_CHANNEL_ACCESS_TOKEN');if(setting.error||!setting.data?.enabled||!/^C[0-9a-f]{32}$/.test(setting.data.group_id||'')||!token)return reply(origin,503,{ok:false,error:'group_not_configured'});try{const r=await fetcher('https://api.line.me/v2/bot/group/'+setting.data.group_id+'/summary',{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const group=await r.json();return reply(origin,200,{ok:group.groupId===setting.data.group_id&&String(group.groupName||'').normalize('NFKC').includes('青年'),group_name:group.groupName});}catch{return reply(origin,503,{ok:false,error:'group_lookup_unavailable'});}}
   if(command.action!=='dispatch')return reply(origin,400,{ok:false,error:'invalid_action'});
   const result=await dispatchMemberCare({db,token:env('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||env('LINE_CHANNEL_ACCESS_TOKEN'),fetcher});return reply(origin,result.ok?200:503,result);
  }

  if(request.method!=='POST'||!originSet.has(origin))return reply(origin,403,{ok:false,error:'forbidden'});
  if(Number(request.headers.get('content-length')||0)>32768)return reply(origin,413,{ok:false,error:'invalid_input'});
  let body:any;try{const raw=await request.text();if(new TextEncoder().encode(raw).length>32768)throw Error();body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{return reply(origin,400,{ok:false,error:'invalid_input'});}
  if(!['M+','SHiNE'].includes(body.church)||!['prayer_list','prayer_create','journal_get','journal_history','journal_save'].includes(body.action)||(body.church==='SHiNE'&&!['journal_get','journal_history','journal_save'].includes(body.action)))return reply(origin,400,{ok:false,error:'invalid_action'});
  const who=await identity(body);if(who.error)return reply(origin,who.error==='line_unavailable'?503:401,{ok:false,error:who.error});
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply(origin,503,{ok:false,error:'unavailable'});
  // Subject and church come exclusively from verified credentials and validated route.
  const input:any={};for(const key of ['title','content','audience','request_id','date','note','complete','revision','before'])if(Object.hasOwn(body,key))input[key]=body[key];
  try{const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),r=await db.rpc('member_care_operation',{p_church:body.church,p_channel:channel,p_subject:who.subject,p_action:body.action,p_input:input});if(r.error){const code=['binding_required','invalid_input','invalid_date','rate_limited','request_reused','version_conflict','invalid_action'].includes(r.error.message)?r.error.message:'unavailable';return reply(origin,code==='binding_required'?403:code==='rate_limited'?429:code==='unavailable'?503:409,{ok:false,error:code});}if(r.data?.ok!==true)return reply(origin,503,{ok:false,error:'unavailable'});return reply(origin,200,r.data);}catch{return reply(origin,503,{ok:false,error:'unavailable'});}
 };
}
