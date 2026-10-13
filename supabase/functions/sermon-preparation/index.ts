import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {emptyDraft,validateDraft,generationReady,JOB_KINDS,videoUrl} from '../../../sermon-preparation-contract.mjs';
const ORIGIN='https://mscos.mchurch.online',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers=(origin:string)=>({'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin',...(origin===ORIGIN?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS'});
const json=(o:string,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:headers(o)});
const safeErrors=new Set(['forbidden','not_found','conflict','invalid_request','invalid_draft','invalid_materials','invalid_outline','invalid_slides','outline_required','materials_need_review','manuscript_too_short','project_limit','queue_limit','generation_limit']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return json(origin,origin===ORIGIN?200:403,{ok:origin===ORIGIN});
 if(req.method!=='POST'||origin!==ORIGIN)return json(origin,403,{ok:false,error:'forbidden'});
 try{
  const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];if(!token)return json(origin,401,{ok:false,error:'login_required'});
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',pub=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
  if(!url||!key||!pub)return json(origin,503,{ok:false,error:'unavailable'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
  const [userResult,capabilities]=await Promise.all([auth.auth.getUser(),auth.rpc('get_my_app_capabilities')]);
  const user=userResult.data.user;if(userResult.error||!user||capabilities.error||capabilities.data?.has_line!==true)return json(origin,403,{ok:false,error:'forbidden'});
  const [profile,permissions]=await Promise.all([db.rpc('get_weekly_bulletin_review_profile',{p_user:user.id,p_church:'M+'}),auth.rpc('get_my_feature_permissions',{p_church:'M+'})]);
  if(profile.error||profile.data?.editor!==true||permissions.error)return json(origin,403,{ok:false,error:'forbidden'});
  const raw=await req.text();if(new TextEncoder().encode(raw).length>600000)return json(origin,413,{ok:false,error:'invalid_request'});
  const body=JSON.parse(raw);if(!body||typeof body!=='object'||body.church!=='M+')throw Error('invalid_request');
  const action=body.action,feature=(permissions.data||[]).find((p:any)=>p.feature_key==='website_weekly');
  if(action==='create'&&feature?.create===false)throw Error('forbidden');
  const input:any={};
  if(!['list','create','load','save','enqueue','job','version','archive'].includes(action))throw Error('invalid_request');
  if(action==='create'){
   for(const [key,max] of [['title',200],['speaker',80],['scripture',200]] as const){if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)throw Error('invalid_request');input[key]=body[key].trim();}
   input.service_date=body.service_date||'';if(input.service_date&&!/^\d{4}-\d{2}-\d{2}$/.test(input.service_date))throw Error('invalid_request');
   input.payload=validateDraft(body.payload||emptyDraft({title:input.title,speaker:input.speaker,scripture:input.scripture,service_date:input.service_date}));input.request_id=body.request_id;if(!UUID.test(input.request_id||''))throw Error('invalid_request');
  }else if(action==='job'){input.job_id=body.job_id;if(!UUID.test(input.job_id||''))throw Error('invalid_request');}
  else if(action!=='list'){
   input.project_id=body.project_id;if(!UUID.test(input.project_id||''))throw Error('invalid_request');
   if(action==='save'){input.payload=validateDraft(body.payload);input.base_version=body.base_version;if(!Number.isSafeInteger(input.base_version)||input.base_version<1)throw Error('invalid_request');}
   if(action==='version'){input.version=body.version;if(!Number.isSafeInteger(input.version)||input.version<1)throw Error('invalid_request');}
   if(action==='enqueue'){
    input.kind=body.kind;input.request_id=body.request_id;input.base_version=body.base_version;
    if(!JOB_KINDS.includes(input.kind)||input.kind==='backup'||!UUID.test(input.request_id||'')||!Number.isSafeInteger(input.base_version))throw Error('invalid_request');
    input.options={};
    if(input.kind==='search'){const query=body.options?.query;if(typeof query!=='string'||!query.trim()||query.length>80)throw Error('invalid_request');input.options={query:query.trim()};}
    if(input.kind==='media')input.options={url:videoUrl(body.options?.url)};
    if(input.kind==='detail'){
     const o=body.options;if(!o||typeof o.url!=='string'||o.url.length>2000||!/^https?:\/\//.test(o.url)||!Number.isSafeInteger(o.ordinal)||o.ordinal<0||!/^[a-f0-9]{64}$/.test(o.content_sha||''))throw Error('invalid_request');
     input.options={url:o.url,ordinal:o.ordinal,content_sha:o.content_sha};
    }
    if(['outline','manuscript','slides'].includes(input.kind)){
     const current=await db.rpc('sermon_workspace_call',{p_user:user.id,p_action:'load',p_input:{project_id:input.project_id}});
     if(current.error)throw Error('not_found');generationReady(current.data.payload,input.kind);
     for(const material of current.data.payload.materials.filter((m:any)=>m.kind==='transcript')){
      const source=await db.rpc('sermon_workspace_call',{p_user:user.id,p_action:'job',p_input:{job_id:material.job_id}});
      const original=source.data?.job?.kind==='media'&&source.data.job.status==='completed'?source.data.job.result?.items?.find((m:any)=>m.id===material.id):null;
      if(source.error||!original||['content','content_sha','url','start','end'].some(key=>original[key]!==material[key]))throw Error('invalid_materials');
     }
    }
   }
  }
  const result=await db.rpc('sermon_workspace_call',{p_user:user.id,p_action:action,p_input:input});
  if(result.error)throw Error(safeErrors.has(result.error.message)?result.error.message:'unavailable');
  return json(origin,200,{ok:true,...result.data});
 }catch(error){
  const message=error instanceof Error?error.message:'unavailable',safe=safeErrors.has(message)?message:'unavailable';
  return json(origin,safe==='forbidden'?403:safe==='not_found'?404:safe==='conflict'?409:safe==='unavailable'?503:400,{ok:false,error:safe});
 }
});

