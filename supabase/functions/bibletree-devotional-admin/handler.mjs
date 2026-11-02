const OS_URL='https://aqanuwilmvdtlzuqlrau.supabase.co';
const OS_KEY='sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ';
const ORIGIN='https://mscos.mchurch.online';
const ACTIONS=new Set(['list','get','history','save']);
export function hasContentAccess(user,grants,permissions,capabilities,write=false,workProfile=null){
 if(!user?.id||!Array.isArray(grants)||!Array.isArray(permissions))return false;
 const line=capabilities?.has_line===true||user.identities?.some(i=>i.provider==='custom:line-web');
 if(!line&&!(user.email_confirmed_at&&workProfile?.profile))return false;
 for(const key of ['members','tree_reading_admin']){
  if(!grants.some(g=>g.church_id==='M+'&&g.permission===key))return false;
  const p=permissions.find(p=>p.feature_key===key);if(p?.view===false)return false;
 }
 const p=permissions.find(p=>p.feature_key==='tree_reading_admin');
 return !write||p?.approve===true;
}
export function createHandler({gameURL,gameSecret,fetcher=fetch}){
 const headers={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.headers.get('origin')!==ORIGIN)return response({ok:false,error:'forbidden'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({ok:false,error:'invalid_method'},405);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))return response({ok:false,error:'login_required'},401);
  if(!gameURL||!gameSecret)return response({ok:false,error:'unavailable'},503);
  try{
   const text=await request.text();if(text.length>70000)return response({ok:false,error:'invalid_request'},400);
   let body;try{body=JSON.parse(text);}catch{return response({ok:false,error:'invalid_request'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body)||!ACTIONS.has(body.action))return response({ok:false,error:'invalid_action'},400);
   const authHeaders={apikey:OS_KEY,authorization,'content-type':'application/json'};
   const os=async(path,payload)=>{const r=await fetcher(OS_URL+path,{method:payload?'POST':'GET',headers:authHeaders,body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('forbidden');return r.json();};
   const [user,grants,permissions,capabilities]=await Promise.all([os('/auth/v1/user'),os('/rest/v1/rpc/get_my_church_access',{}),os('/rest/v1/rpc/get_my_feature_permissions',{p_church:'M+'}),os('/rest/v1/rpc/get_my_app_capabilities',{})]);
   const hasLine=capabilities?.has_line===true||user.identities?.some(i=>i.provider==='custom:line-web');
   const workProfile=!hasLine&&user.email_confirmed_at?await os('/rest/v1/rpc/get_work_profile',{p_user:null,p_church:'M+'}):null;
   const canEdit=hasContentAccess(user,grants,permissions,capabilities,true,workProfile);
   if(!hasContentAccess(user,grants,permissions,capabilities,false,workProfile)||body.action==='save'&&!canEdit)return response({ok:false,error:'forbidden'},403);
   const payload={day:body.day,expected_revision:body.expected_revision,values:body.values,note:body.note};
   const r=await fetcher(gameURL+'/rest/v1/rpc/game_devotional_admin',{method:'POST',headers:{apikey:gameSecret,authorization:'Bearer '+gameSecret,'content-type':'application/json'},body:JSON.stringify({p_action:body.action,p_actor:user.id,p_payload:payload}),signal:AbortSignal.timeout(15000)});
   const result=await r.json();
   if(!r.ok){const code=String(result?.message||'');const known=['REVISION_CONFLICT','TOO_SHORT','REQUIRED_FIELDS','FIELD_LENGTH','INVALID_FIELD','NOTE_LENGTH','NOT_FOUND'];const error=known.find(x=>code.includes('BT_'+x))?.toLowerCase()||'unavailable';return response({ok:false,error},error==='revision_conflict'?409:error==='unavailable'?503:400);}
   if(result?.ok!==true)return response({ok:false,error:'invalid_response'},502);
   return response({...result,canEdit});
  }catch(error){return response({ok:false,error:error.message==='forbidden'?'forbidden':'connection_error'},error.message==='forbidden'?403:503);}
 };
}

