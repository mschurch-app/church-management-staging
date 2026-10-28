const OS_URL='https://aqanuwilmvdtlzuqlrau.supabase.co';
const OS_KEY='sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ';
const ORIGIN='https://mscos.mchurch.online';
export const FILTERS=['all','active','beta','feedback','no_profile'];
export function listRequest(body){
 if(!body||Array.isArray(body)||body.action!=='list')return null;
 const query=typeof body.query==='string'?body.query.trim():'';
 const filter=body.filter??'all',offset=body.offset??0;
 if(query.length>80||!FILTERS.includes(filter)||!Number.isSafeInteger(offset)||offset<0||offset>1000000)return null;
 return {p_query:query,p_filter:filter,p_offset:offset,p_limit:25};
}
export function hasPlayerAccess(user,grants,permissions,capabilities,workProfile){
 if(!user?.id||!Array.isArray(grants)||!Array.isArray(permissions))return false;
 const hasLine=capabilities?.has_line===true||user.identities?.some(i=>i.provider==='custom:line-web');
 if(!hasLine&&!(user.email_confirmed_at&&workProfile?.profile))return false;
 return ['members','tree_reading_admin'].every(key=>grants.some(g=>g.church_id==='M+'&&g.permission===key)&&permissions.find(p=>p.feature_key===key)?.view!==false);
}
export function createHandler({gameURL,gameSecret,fetcher=fetch}){
 const headers={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.headers.get('origin')!==ORIGIN)return response({ok:false,error:'forbidden'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response({ok:false,error:'invalid_method'},405);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]{1,8000}$/.test(authorization))return response({ok:false,error:'login_required'},401);
  if(!gameURL||!gameSecret)return response({ok:false,error:'unavailable'},503);
  try{
   if(Number(request.headers.get('content-length')||0)>2048)return response({ok:false,error:'invalid_request'},400);
   const text=await request.text();if(text.length>2048)return response({ok:false,error:'invalid_request'},400);
   let body;try{body=JSON.parse(text);}catch{return response({ok:false,error:'invalid_request'},400);}
   const payload=listRequest(body);if(!payload)return response({ok:false,error:'invalid_request'},400);
   const os=async(path,payload)=>{
    const r=await fetcher(OS_URL+path,{method:payload?'POST':'GET',headers:{apikey:OS_KEY,authorization,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error(r.status===401||r.status===403?'forbidden':'connection_error');return r.json();
   };
   const [user,grants,permissions,capabilities]=await Promise.all([os('/auth/v1/user'),os('/rest/v1/rpc/get_my_church_access',{}),os('/rest/v1/rpc/get_my_feature_permissions',{p_church:'M+'}),os('/rest/v1/rpc/get_my_app_capabilities',{})]);
   const hasLine=capabilities?.has_line===true||user.identities?.some(i=>i.provider==='custom:line-web');
   const workProfile=!hasLine&&user.email_confirmed_at?await os('/rest/v1/rpc/get_work_profile',{p_user:null,p_church:'M+'}):null;
   if(!hasPlayerAccess(user,grants,permissions,capabilities,workProfile))return response({ok:false,error:'forbidden'},403);
   const r=await fetcher(gameURL+'/rest/v1/rpc/game_players_admin',{method:'POST',headers:{apikey:gameSecret,authorization:'Bearer '+gameSecret,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
   const result=await r.json();
   if(!r.ok||result?.ok!==true||!Array.isArray(result.players))return response({ok:false,error:'unavailable'},503);
   return response(result);
  }catch(error){return response({ok:false,error:error.message==='forbidden'?'forbidden':'connection_error'},error.message==='forbidden'?403:503);}
 };
}
