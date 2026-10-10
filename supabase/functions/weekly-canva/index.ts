import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const APP='https://mscos.mchurch.online';
const API='https://api.canva.com/rest/v1';
const BUCKET='church-website-public-media';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_-]{5,100}$/;
const SCOPES=['design:content:read','design:content:write','design:meta:read','brandtemplate:meta:read','brandtemplate:content:read'];
const REQUIRED=['TOPIC','SCRIPTURE','SPEAKER','SERVICE_DATE'];
const THEMES:Record<string,{label:string;words:string[]}>={
  default:{label:'通用',words:[]},
  shelter:{label:'山與守護',words:['保護','守護','磐石','山','避難','121']},
  water:{label:'活水與平安',words:['活水','生命水','河','泉','海','風浪','平靜']},
  light:{label:'光與盼望',words:['光','盼望','榮耀','黎明','晨光']},
  growth:{label:'生命與成長',words:['生命樹','葡萄','果子','栽種','枝子','成長']},
  spirit:{label:'聖靈與更新',words:['聖靈','火','煉淨','更新']},
  journey:{label:'道路與信心',words:['曠野','沙漠','道路','旅程','跟隨','方向','信心']},
};
const enc=new TextEncoder();
type DB=ReturnType<typeof createClient>;
type Output={template_id:string;data:Record<string,unknown>;autofill_id?:string;design_id?:string;export_id?:string;storage_path?:string;stage:string};
type Job={id:string;church_id:string;requested_by:string;bulletin_id:string;input:Record<string,string>;outputs:Record<string,Output>;status:string;last_error?:string;lease?:string};
const cors=(origin:string)=>({...(origin===APP?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});
const json=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
class Failure extends Error{constructor(message:string,public status=503){super(message);}}
function cfg(){
  const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!service)throw new Failure('unavailable');
  const id=Deno.env.get('CANVA_CLIENT_ID')||'',secret=Deno.env.get('CANVA_CLIENT_SECRET')||'',key=Deno.env.get('CANVA_TOKEN_ENCRYPTION_KEY')||'';
  return {id,secret,key,ready:!!id&&!!secret&&key.length>=32,redirect:`${url}/functions/v1/weekly-canva/callback`,db:createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})};
}
type Config=ReturnType<typeof cfg>;
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
const bytes=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(48))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const hash=async(v:string)=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
async function cipherKey(c:Config){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(c.key)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(c:Config,value:unknown,context:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(context)},await cipherKey(c),enc.encode(JSON.stringify(value)));
  return {iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
async function decrypt(c:Config,value:{iv:string;ciphertext:string},context:string){
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:enc.encode(context)},await cipherKey(c),bytes(value.ciphertext))));
}
async function profile(db:DB,userId:string,church:string){
  const r=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});
  if(r.error)throw new Failure('unavailable');
  return r.data||{};
}
async function tokenRequest(c:Config,values:Record<string,string>){
  let response:Response;
  try{response=await fetch(`${API}/oauth/token`,{method:'POST',redirect:'error',headers:{authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(20000)});}
  catch{throw new Failure('connection_required',409);}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token||!data.refresh_token||!Number.isFinite(data.expires_in))throw new Failure('connection_required',409);
  return data;
}
async function accessToken(c:Config,church:string){
  const initial=await c.db.from('weekly_canva_connections').select('*').eq('church_id',church).maybeSingle();
  if(initial.error)throw new Failure('unavailable');
  if(!initial.data)throw new Failure('connection_required',409);
  let row=initial.data;
  if(Date.parse(row.expires_at)>Date.now()+60000)return (await decrypt(c,row.credentials,`canva:${church}:tokens`)).access_token;
  const lease=crypto.randomUUID(),claimed=await c.db.rpc('claim_weekly_canva_refresh',{p_church:church,p_lease:lease});
  if(claimed.error)throw new Failure('unavailable');
  if(claimed.data!==true)throw new Failure('connection_busy',409);
  try{
    // Re-read after claiming: another request may already have refreshed rotated credentials.
    const latest=await c.db.from('weekly_canva_connections').select('*').eq('church_id',church).single();
    if(latest.error)throw new Failure('connection_required',409);
    row=latest.data;
    const old=await decrypt(c,row.credentials,`canva:${church}:tokens`);
    if(Date.parse(row.expires_at)>Date.now()+60000)return old.access_token;
    const next=await tokenRequest(c,{grant_type:'refresh_token',refresh_token:old.refresh_token});
    const saved=await c.db.from('weekly_canva_connections').update({credentials:await encrypt(c,{access_token:next.access_token,refresh_token:next.refresh_token},`canva:${church}:tokens`),expires_at:new Date(Date.now()+next.expires_in*1000).toISOString()}).eq('church_id',church).eq('refresh_lease',lease).select('church_id').single();
    if(saved.error)throw new Failure('connection_required',409);
    return next.access_token;
  }finally{await c.db.from('weekly_canva_connections').update({refresh_lease:null,refresh_lease_until:null}).eq('church_id',church).eq('refresh_lease',lease);}
}
async function canva(token:string,path:string,body?:unknown){
  let response:Response;
  try{response=await fetch(API+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});}
  catch{throw new Failure(body===undefined?'canva_unavailable':'creation_unknown');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401)throw new Failure('connection_required',409);
    if(response.status===429)throw new Failure('rate_limited',429);
    if(response.status===403)throw new Failure('canva_access_denied',403);
    throw new Failure('canva_unavailable');
  }
  return data;
}
const callback=(church:string,result:string)=>new Response(null,{status:303,headers:{location:`${APP}/canva-callback.html?church=${encodeURIComponent(church)}&result=${result}`,'cache-control':'no-store','referrer-policy':'no-referrer'}});
async function oauthCallback(req:Request,c:Config){
  const url=new URL(req.url),state=url.searchParams.get('state')||'';
  if(!c.ready||state.length<30||state.length>100)return callback('','error');
  const found=await c.db.from('weekly_canva_oauth_states').update({consumed_at:new Date().toISOString()}).eq('state_hash',await hash(state)).is('consumed_at',null).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();
  if(found.error||!found.data)return callback('','error');
  const row=found.data,church=row.church_id;
  try{
    if(!(await profile(c.db,row.user_id,church)).reviewer)throw new Failure('forbidden',403);
    const code=url.searchParams.get('code');
    if(url.searchParams.has('error')||!code)return callback(church,'cancelled');
    const verifier=await decrypt(c,row.verifier,`canva:${church}:verifier`);
    const tokens=await tokenRequest(c,{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:c.redirect});
    const scopes=String(tokens.scope||'').split(' ');
    if(!SCOPES.every(s=>scopes.includes(s)))throw new Failure('scope_required',409);
    // Reconnecting may change Canva accounts. Clear old template choices.
    const saved=await c.db.from('weekly_canva_connections').upsert({church_id:church,credentials:await encrypt(c,{access_token:tokens.access_token,refresh_token:tokens.refresh_token},`canva:${church}:tokens`),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),connected_by:row.user_id,connected_at:new Date().toISOString(),templates:{},refresh_lease:null,refresh_lease_until:null},{onConflict:'church_id'});
    if(saved.error)throw new Failure('unavailable');
    return callback(church,'connected');
  }catch{return callback(church,'error');}
}
function inputs(body:any):Record<string,string>{
  const limits:Record<string,number>={TOPIC:150,SCRIPTURE:150,SPEAKER:100,SERVICE_DATE:10,SUBTITLE:500,SERVICE_TIME:200};
  const result:Record<string,string>={};
  for(const [key,max] of Object.entries(limits)){
    const value=body.input?.[key];
    if(typeof value!=='string'||value.length>max)throw new Failure('invalid_request',400);
    result[key]=value.trim();
  }
  if(!REQUIRED.every(k=>result[k])||!/^\d{4}-\d{2}-\d{2}$/.test(result.SERVICE_DATE))throw new Failure('information_required',400);
  result.CHURCH_NAME=body.church==='M+'?'M+ 大雅教會':'火樂教會';
  return result;
}
async function templateData(token:string,id:string,input:Record<string,string>){
  if(!ID.test(id))throw new Failure('templates_required',400);
  const result=await canva(token,`/brand-templates/${encodeURIComponent(id)}/dataset`),dataset=result.dataset||{};
  if(!REQUIRED.every(key=>dataset[key]?.type==='text'))throw new Failure('template_fields_required',400);
  return Object.fromEntries(Object.entries(input).filter(([key])=>dataset[key]?.type==='text').map(([key,text])=>[key,{type:'text',text}]));
}
function publicJob(job:Job){
  return {id:job.id,bulletinId:job.bulletin_id,status:job.status,error:job.last_error||null,input:job.input,outputs:Object.fromEntries(Object.entries(job.outputs).map(([kind,o])=>[kind,{stage:o.stage,path:o.storage_path||null,designId:o.design_id||null}]))};
}
async function ownedJob(c:Config,id:string,church:string,userId:string){
  if(!UUID.test(id))throw new Failure('invalid_request',400);
  const r=await c.db.from('weekly_canva_jobs').select('*').eq('id',id).eq('church_id',church).eq('requested_by',userId).maybeSingle();
  if(r.error)throw new Failure('unavailable');
  if(!r.data)throw new Failure('not_found',404);
  return r.data as Job;
}
async function ensureEditable(c:Config,job:{bulletin_id:string;church_id:string}){
  const row=await c.db.from('website_weekly_bulletins').select('status').eq('id',job.bulletin_id).eq('church_id',job.church_id).maybeSingle();
  if(row.error)throw new Failure('unavailable');
  if(row.data&&!['draft','changes_requested'].includes(row.data.status))throw new Failure('bulletin_locked',409);
  // No match must also mean this UUID is not another church's bulletin.
  if(!row.data){const elsewhere=await c.db.from('website_weekly_bulletins').select('id').eq('id',job.bulletin_id).maybeSingle();if(elsewhere.error||elsewhere.data)throw new Failure('forbidden',403);}
}
async function saveJob(c:Config,job:Job,lease:string){
  const r=await c.db.from('weekly_canva_jobs').update({outputs:job.outputs,status:job.status,last_error:job.last_error||null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease',lease).select('id').single();
  if(r.error)throw new Failure('job_save_failed');
}
function jpegSize(data:Uint8Array){
  if(data[0]!==255||data[1]!==216)throw new Failure('invalid_image');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  for(let pos=2;pos+8<data.length;){
    if(data[pos]!==255)throw new Failure('invalid_image');
    while(data[pos]===255)pos++;
    const marker=data[pos++];
    if(marker===217||marker===218)break;
    if(marker===1||(marker>=208&&marker<=215))continue;
    const length=view.getUint16(pos);
    if(length<2||pos+length>data.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {height:view.getUint16(pos+3),width:view.getUint16(pos+5)};
    pos+=length;
  }
  throw new Failure('invalid_image');
}
async function downloadImage(url:string,kind:string){
  const target=new URL(url);
  if(target.protocol!=='https:'||target.port||target.username||target.password||!(target.hostname==='canva.com'||target.hostname.endsWith('.canva.com')))throw new Failure('invalid_export');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(target,{redirect:'error',signal:controller.signal});
    if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('image/jpeg'))throw new Failure('invalid_export');
    const reader=response.body.getReader(),parts:Uint8Array[]=[],limit=12*1024*1024;let size=0;
    while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit){await reader.cancel();throw new Failure('image_too_large');}parts.push(item.value);}
    const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
    const dimensions=jpegSize(data),width=kind==='home'?1600:1080,height=kind==='home'?900:1920;
    if(dimensions.width!==width||dimensions.height!==height)throw new Failure('template_dimensions',400);
    return data;
  }finally{clearTimeout(timer);}
}
async function advance(c:Config,job:Job){
  if(job.status!=='working')return job;
  const lease=crypto.randomUUID(),claim=await c.db.rpc('claim_weekly_canva_job',{p_id:job.id,p_lease:lease});
  if(claim.error)throw new Failure('unavailable');
  if(claim.data!==true)return job;
  let posting=false;
  try{
    // The first read preceded the lease; reload to avoid repeating another worker's step.
    job=await ownedJob(c,job.id,job.church_id,job.requested_by);
    const token=await accessToken(c,job.church_id);
    const next=Object.entries(job.outputs).find(([,o])=>!o.storage_path);
    if(!next){job.status='ready';await saveJob(c,job,lease);return job;}
    const [kind,output]=next;
    if((output.stage==='creating'&&!output.autofill_id)||(output.stage==='exporting'&&!output.export_id)){
      job.status='blocked';job.last_error='creation_unknown';await saveJob(c,job,lease);return job;
    }
    if(!output.autofill_id){
      output.stage='creating';await saveJob(c,job,lease);
      posting=true;
      const result=await canva(token,'/autofills',{type:'create_from_brand_template',brand_template_id:output.template_id,title:`${job.input.SERVICE_DATE} ${kind==='home'?'主日預告':'IG 宣傳'} ${job.input.TOPIC}`.slice(0,255),data:output.data});
      if(!result.job?.id)throw new Failure('creation_unknown');
      output.autofill_id=result.job.id;output.stage='autofill';
      await saveJob(c,job,lease);posting=false;
    }else if(!output.design_id){
      const result=await canva(token,`/autofills/${encodeURIComponent(output.autofill_id)}`);
      if(result.job?.status==='failed')throw new Failure('autofill_failed');
      if(result.job?.status==='success'){
        const design=result.job.result?.design;if(!ID.test(design?.id||''))throw new Failure('invalid_design');
        output.design_id=design.id;output.stage='design_ready';await saveJob(c,job,lease);
      }
    }else if(!output.export_id){
      // The pages API is preview-only and blocks public integration review.
      // Validate the actual exported JPEG dimensions instead.
      output.stage='exporting';await saveJob(c,job,lease);
      posting=true;
      const result=await canva(token,'/exports',{design_id:output.design_id,format:{type:'jpg',quality:90,width:kind==='home'?1600:1080,height:kind==='home'?900:1920,pages:[1]}});
      if(!result.job?.id)throw new Failure('creation_unknown');
      output.export_id=result.job.id;output.stage='export';await saveJob(c,job,lease);posting=false;
    }else{
      const result=await canva(token,`/exports/${encodeURIComponent(output.export_id)}`);
      if(result.job?.status==='failed')throw new Failure('export_failed');
      if(result.job?.status==='success'){
        if(result.job.urls?.length!==1)throw new Failure('invalid_export');
        const data=await downloadImage(result.job.urls[0],kind),path=`${job.church_id}/weekly/${job.bulletin_id}/canva/${job.id}-${kind}.jpg`;
        const saved=await c.db.storage.from(BUCKET).upload(path,data,{contentType:'image/jpeg',cacheControl:'3600',upsert:true});
        if(saved.error)throw new Failure('image_save_failed');
        output.storage_path=path;output.stage='ready';
        if(Object.values(job.outputs).every(o=>o.storage_path))job.status='ready';
        await saveJob(c,job,lease);
      }
    }
    return job;
  }catch(error){
    const code=error instanceof Failure?error.message:'canva_unavailable';
    if(posting&&['connection_required','rate_limited','canva_access_denied','canva_unavailable'].includes(code)){
      const output=Object.values(job.outputs).find(o=>['creating','exporting'].includes(o.stage));
      if(output)output.stage=output.stage==='creating'?'queued':'design_ready';
      await saveJob(c,job,lease);throw error;
    }
    // A remote POST can succeed even if its response or local persistence fails.
    // Never repeat it silently. A new explicit request is needed in this case.
    if(posting||['autofill_failed','export_failed','template_dimensions','invalid_design','invalid_image','invalid_export','image_too_large'].includes(code)){
      job.status='blocked';job.last_error=posting?'creation_unknown':code;
      await saveJob(c,job,lease);
      return job;
    }
    throw error;
  }finally{await c.db.from('weekly_canva_jobs').update({lease:null,lease_until:null}).eq('id',job.id).eq('lease',lease);}
}
async function handle(req:Request,c:Config,userId:string,body:any){
  const church=body?.church;
  if(!['M+','SHiNE'].includes(church))throw new Failure('invalid_request',400);
  const rights=await profile(c.db,userId,church);
  if(!rights.editor)throw new Failure('forbidden',403);
  if(body.action==='status'){
    const row=await c.db.from('weekly_canva_connections').select('connected_at,templates').eq('church_id',church).maybeSingle();
    if(row.error)throw new Failure('unavailable');
    return {ok:true,configured:c.ready,connected:!!row.data,canManage:rights.reviewer===true,templates:row.data?.templates||{},themes:Object.entries(THEMES).map(([id,v])=>({id,label:v.label}))};
  }
  if(!c.ready)throw new Failure('configuration_required',409);
  if(body.action==='authorize'){
    if(!rights.reviewer)throw new Failure('manager_required',403);
    const state=random(),verifier=random(),now=Date.now();
    await c.db.from('weekly_canva_oauth_states').delete().lt('expires_at',new Date(now-86400000).toISOString());
    const saved=await c.db.from('weekly_canva_oauth_states').insert({state_hash:await hash(state),church_id:church,user_id:userId,verifier:await encrypt(c,verifier,`canva:${church}:verifier`),expires_at:new Date(now+600000).toISOString()});
    if(saved.error)throw new Failure('unavailable');
    const url=new URL('https://www.canva.com/api/oauth/authorize');
    Object.entries({client_id:c.id,redirect_uri:c.redirect,response_type:'code',scope:SCOPES.join(' '),code_challenge:await hash(verifier),code_challenge_method:'s256',state}).forEach(([k,v])=>url.searchParams.set(k,v));
    return {ok:true,authorizationUrl:url.toString()};
  }
  if(body.action==='templates'){
    const token=await accessToken(c,church),continuation=String(body.continuation||'');
    if(continuation.length>3000)throw new Failure('invalid_request',400);
    const result=await canva(token,`/brand-templates?dataset=non_empty&limit=100${continuation?'&continuation='+encodeURIComponent(continuation):''}`);
    return {ok:true,items:(result.items||[]).map((v:any)=>({id:v.id,title:v.title})),continuation:result.continuation||null};
  }
  if(body.action==='save_templates'){
    if(!rights.reviewer)throw new Failure('manager_required',403);
    const previous=await c.db.from('weekly_canva_connections').select('templates,connected_at').eq('church_id',church).single();
    if(previous.error)throw new Failure('connection_required',409);
    const token=await accessToken(c,church),home=String(body.homeTemplate||''),ig=String(body.igTemplate||''),theme=String(body.theme||'default');
    if(!THEMES[theme])throw new Failure('invalid_request',400);
    const sample={TOPIC:'主題',SCRIPTURE:'經文',SPEAKER:'講員',SERVICE_DATE:'2027-01-03'};
    await templateData(token,home,sample);await templateData(token,ig,sample);
    const templates={...previous.data.templates,[theme]:{home,ig}};
    const saved=await c.db.from('weekly_canva_connections').update({templates}).eq('church_id',church).eq('connected_at',previous.data.connected_at).eq('templates',JSON.stringify(previous.data.templates)).select('church_id').single();
    if(saved.error)throw new Failure('unavailable');
    return {ok:true,templates};
  }
  if(['start','reexport'].includes(body.action)){
    if(!UUID.test(body.requestId||'')||!UUID.test(body.bulletinId||''))throw new Failure('invalid_request',400);
    const old=await c.db.from('weekly_canva_jobs').select('*').eq('id',body.requestId).maybeSingle();
    if(old.error)throw new Failure('unavailable');
    if(old.data){
      if(old.data.requested_by!==userId||old.data.church_id!==church||old.data.bulletin_id!==body.bulletinId)throw new Failure('forbidden',403);
      return {ok:true,job:publicJob(old.data)};
    }
    await ensureEditable(c,{bulletin_id:body.bulletinId,church_id:church});
    const parent=body.action==='reexport'?await ownedJob(c,String(body.parentJobId||''),church,userId):null;
    if(parent&&(parent.bulletin_id!==body.bulletinId||!Object.values(parent.outputs).every(o=>o.design_id)))throw new Failure('invalid_request',400);
    const input=parent?.input||inputs(body),token=await accessToken(c,church),outputs:Record<string,Output>={};
    const recent=await c.db.from('weekly_canva_jobs').select('id',{count:'exact',head:true}).eq('requested_by',userId).gte('created_at',new Date(Date.now()-3600000).toISOString());
    if(recent.error)throw new Failure('unavailable');
    if((recent.count||0)>=20)throw new Failure('rate_limited',429);
    const connection=await c.db.from('weekly_canva_connections').select('templates').eq('church_id',church).single();
    if(connection.error)throw new Failure('connection_required',409);
    const text=input.TOPIC+' '+input.SCRIPTURE,templates=connection.data.templates||{};
    const theme=Object.entries(THEMES).find(([key,v])=>key!=='default'&&templates[key]?.home&&templates[key]?.ig&&v.words.some(word=>text.includes(word)))?.[0]||'default';
    if(!parent)input.TEMPLATE_THEME=THEMES[theme].label;
    for(const kind of ['home','ig']){
      if(parent){const previous=parent.outputs[kind];outputs[kind]={template_id:previous.template_id,data:previous.data,autofill_id:previous.autofill_id,design_id:previous.design_id,stage:'design_ready'};continue;}
      const template=templates[theme]?.[kind];
      outputs[kind]={template_id:template,data:await templateData(token,template,input),stage:'queued'};
    }
    const saved=await c.db.from('weekly_canva_jobs').upsert({id:body.requestId,church_id:church,requested_by:userId,bulletin_id:body.bulletinId,input,outputs},{onConflict:'id',ignoreDuplicates:true});
    if(saved.error)throw new Failure('unavailable');
    const job=await ownedJob(c,body.requestId,church,userId);
    return {ok:true,job:publicJob(job)};
  }
  if(['get','advance','edit_link'].includes(body.action)){
    let job=await ownedJob(c,String(body.jobId||''),church,userId);
    await ensureEditable(c,job);
    if(body.action==='edit_link'){
      const kind=body.kind;if(!['home','ig'].includes(kind)||!job.outputs[kind]?.design_id)throw new Failure('not_found',404);
      const token=await accessToken(c,church),design=await canva(token,`/designs/${encodeURIComponent(job.outputs[kind].design_id!)}`),link=design.design?.urls?.edit_url;
      if(typeof link!=='string'||!link.startsWith('https://www.canva.com/'))throw new Failure('invalid_design');
      return {ok:true,url:link};
    }
    if(body.action==='advance')job=await advance(c,job);
    return {ok:true,job:publicJob(job)};
  }
  throw new Failure('invalid_action',400);
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'',url=new URL(req.url);
  if(req.method==='OPTIONS')return origin===APP?new Response('ok',{headers:cors(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  let c:Config;try{c=cfg();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  if(req.method==='GET'&&url.pathname.endsWith('/callback'))return oauthCallback(req,c);
  if(req.method!=='POST'||origin!==APP)return json(origin,{ok:false,error:'forbidden'},403);
  const jwt=(req.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!jwt)return json(origin,{ok:false,error:'login_required'},401);
  const auth=await c.db.auth.getUser(jwt);
  if(auth.error||!auth.data.user)return json(origin,{ok:false,error:'login_required'},401);
  try{
    const body=await req.json();
    return json(origin,await handle(req,c,auth.data.user.id,body));
  }catch(error){return json(origin,{ok:false,error:error instanceof Failure?error.message:'unavailable'},error instanceof Failure?error.status:503);}
});
