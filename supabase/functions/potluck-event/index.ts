import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
const allowed=new Set(['https://mscos.mchurch.online','https://mchurch.online','http://127.0.0.1:8769']);
const channel='2011645391';
const cors=(origin:string)=>({'access-control-allow-origin':allowed.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization,apikey,x-client-info','cache-control':'no-store','vary':'Origin','content-type':'application/json; charset=utf-8'});
const json=(origin:string,status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
async function lineIdentity(body:Record<string,unknown>){
 let unavailable=false;
 if(typeof body.idToken==='string'&&body.idToken.length>0&&body.idToken.length<=8192){
  try{const r=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:body.idToken,client_id:channel})});
   if(r.status===429||r.status>=500)unavailable=true;
   if(r.ok){const d=await r.json();if(d.aud===channel&&d.iss==='https://access.line.me'&&Number.isSafeInteger(d.exp)&&d.exp>Date.now()/1000&&/^U[0-9a-f]{32}$/.test(d.sub))return d.sub;}
  }catch{unavailable=true;}
 }
 if(typeof body.accessToken==='string'&&body.accessToken.length>0&&body.accessToken.length<=8192){
  try{const r=await fetch('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(body.accessToken),{redirect:'error',signal:AbortSignal.timeout(8000)});
   if(r.status===429||r.status>=500)unavailable=true;
   if(r.ok){const d=await r.json();if(d.client_id===channel&&Number.isFinite(d.expires_in)&&d.expires_in>0){const p=await fetch('https://api.line.me/v2/profile',{headers:{authorization:'Bearer '+body.accessToken},redirect:'error',signal:AbortSignal.timeout(8000)});if(p.ok){const v=await p.json();if(/^U[0-9a-f]{32}$/.test(v.userId))return v.userId;}else if(p.status>=500)unavailable=true;}}
  }catch{unavailable=true;}
 }
 throw new Error(unavailable?'line_unavailable':'login_required');
}
function validatedData(action:string,input:unknown){
 const source=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const out:Record<string,unknown>={};
 const keys=action==='save'?['request_id','id','version','category_id','display_name','dish_name','servings','notes','allergen_info','storage_requirements']:
  action==='cancel'?['request_id','id','version']:['request_id','id','version','category_id','display_name','dish_name','servings','notes','allergen_info','storage_requirements','status','household_id','registration_open','registration_deadline','edit_deadline','allow_user_edit','archived','targets'];
 for(const key of keys)if(Object.hasOwn(source,key))out[key]=source[key];
 if(!['get','public','admin_get','export'].includes(action)){
  if(typeof out.request_id!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(out.request_id))throw new Error('invalid_request');
 }
 if(action==='save'||action==='admin_dish'){
  for(const [key,max,required]of [['display_name',60,true],['dish_name',80,true],['notes',1000,false],['allergen_info',300,false],['storage_requirements',300,false]] as const){const v=out[key]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('invalid_request');out[key]=v.trim();}
  if(typeof out.servings!=='number'||!Number.isFinite(out.servings)||out.servings<=0)throw new Error('invalid_request');
 }
 return out;
}
export async function handler(req:Request){
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
 if(req.method!=='POST'||!allowed.has(origin))return json(origin,403,{ok:false,error:'forbidden'});
 if(Number(req.headers.get('content-length')||0)>3800000)return json(origin,413,{ok:false,error:'image_too_large'});
 let body:Record<string,unknown>;try{const text=await req.text();if(text.length>3800000)return json(origin,413,{ok:false,error:'image_too_large'});body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object')throw 0;}catch{return json(origin,400,{ok:false,error:'invalid_request'});}
 const action=String(body.action||''),slug=String(body.slug||'thanksgiving-2026');
 if(!['public','get','save','cancel','admin_get','export','admin_settings','admin_dish','admin_allow_extra'].includes(action)||!/^[a-z0-9-]{1,80}$/.test(slug))return json(origin,400,{ok:false,error:'invalid_request'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 if(!url||!key)return json(origin,503,{ok:false,error:'unavailable'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let subject:string|null=null,actor:string|null=null,data:Record<string,unknown>;
 try{
  if(action.startsWith('admin_')||action==='export'){
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)throw new Error('login_required');
   const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)throw new Error('login_required');actor=auth.data.user.id;
  }else if(action!=='public')subject=await lineIdentity(body);
  data=validatedData(action,body.data);
 }catch(e){const error=e instanceof Error?e.message:'invalid_request';return json(origin,error==='line_unavailable'?503:error==='login_required'?401:400,{ok:false,error});}
 let uploaded:string|null=null;
 // Client image_path / owner IDs are never trusted; the server assigns the object path.
 if(action==='save'&&body.photo!==undefined){
  if(body.photo===null)data.image_path=null;
  else{
   if(typeof body.photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo))return json(origin,400,{ok:false,error:'invalid_image'});
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(body.photo.split(',')[1]),c=>c.charCodeAt(0));}catch{return json(origin,400,{ok:false,error:'invalid_image'});}
   if(bytes.length<100||bytes.length>2621440||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return json(origin,400,{ok:false,error:'invalid_image'});
   const view=await db.rpc('potluck_action',{p_slug:slug,p_subject:subject,p_action:'get',p_data:{},p_admin:null});
   if(view.error||!view.data?.event)return json(origin,503,{ok:false,error:'unavailable'});
   if(data.id&&!view.data.mine?.some((d:{id:string})=>d.id===data.id))return json(origin,404,{ok:false,error:'not_found'});
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const path=`${view.data.event.id}/${data.request_id}-${digest.slice(0,24)}.jpg`;
   const upload=await db.storage.from('potluck-dishes').upload(path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
   if(upload.error&&!['Duplicate','409'].includes(String(upload.error.statusCode))&&!/already exists/i.test(upload.error.message))return json(origin,503,{ok:false,error:'upload_failed'});
   if(!upload.error)uploaded=path;data.image_path=path;
  }
 }
 const result=await db.rpc('potluck_action',{p_slug:slug,p_subject:subject,p_action:action,p_data:data,p_admin:actor});
 if(result.error){
  if(uploaded)await db.storage.from('potluck-dishes').remove([uploaded]);
  const known=['event_not_found','login_required','forbidden','event_closed','registration_closed','editing_closed','household_limit','not_found','stale_version','request_conflict'];
  const code=known.find(code=>result.error.message?.includes(code))||'invalid_request';
  return json(origin,code==='forbidden'?403:code==='not_found'||code==='event_not_found'?404:code==='stale_version'||code==='request_conflict'?409:400,{ok:false,error:code});
 }
 const output=result.data;
 // Only fields already projected by the SQL permission gate receive signed image URLs.
 if(output&&['get','public','admin_get','export'].includes(action)){
  const paths=[...new Set(['dishes','mine','admin_dishes'].flatMap(k=>(output[k]||[]).map((d:{image_path?:string})=>d.image_path)).filter(Boolean))] as string[];
  const signed=paths.length?await db.storage.from('potluck-dishes').createSignedUrls(paths,3600):{data:[],error:null};
  const map=new Map((signed.data||[]).map((p:{path:string;signedUrl:string})=>[p.path,p.signedUrl]));
  for(const k of ['dishes','mine','admin_dishes'])for(const dish of output[k]||[]){dish.image_url=map.get(dish.image_path)||'';delete dish.image_path;}
 }
 return json(origin,200,{ok:true,...output});
}
Deno.serve(handler);
