import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {validateSubmission,matchesMagic,UUID} from './validation.mjs';
import {buildStoryPresentation} from './layout-plan.mjs';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='testimony-private';
const origins=new Set(['https://mchurch.online','https://www.mchurch.online','https://mscos.mchurch.online','https://mschurch-app.github.io']);
const digest=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function rpc(action:string,input:unknown){const {data,error}=await db.rpc('testimony_service',{p_action:action,p_input:input});if(error)throw Error(error.message);return data;}
const noStore={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',allowed=origins.has(origin),headers={...noStore,'content-type':'application/json',...(allowed?{'access-control-allow-origin':origin,'vary':'Origin'}:{})};
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:{...headers,'access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type,authorization,apikey'}});
 try{
  const requestUrl=new URL(req.url);
  if(['GET','HEAD'].includes(req.method)&&requestUrl.searchParams.get('media')){
   const id=requestUrl.searchParams.get('id'),slot=requestUrl.searchParams.get('media');
   if(!UUID.test(id||'')||!/^\d$/.test(slot||''))return reply(404,{error:'not_found'});
   const result=await rpc('public',{}),story=result.items.find((x:any)=>x.id===id),media=story?.media?.find((x:any)=>String(x.slot)===slot);
   if(!media)return reply(404,{error:'not_found'});
   const signed=await db.storage.from(bucket).createSignedUrl(media.path,60);
   if(signed.error)throw Error('media_unavailable');
   return new Response(null,{status:302,headers:{...noStore,...(allowed?{'access-control-allow-origin':origin,'vary':'Origin'}:{}),location:signed.data.signedUrl}});
  }
  if(req.method==='GET'&&requestUrl.searchParams.get('action')==='public'){
   const result=await rpc('public',{});
   return reply(200,{ok:true,items:result.items.map((s:any)=>({...s,media:s.media.map(({path,extension,...m}:any)=>({...m,url:`${url}/functions/v1/testimony-intake?id=${s.id}&media=${m.slot}`}))}))});
  }
  if(req.method!=='POST')return reply(405,{error:'method_rejected'});
  if(!allowed)return reply(403,{error:'origin_rejected'});
  if(Number(req.headers.get('content-length')||0)>60000)return reply(413,{error:'invalid_input'});
  const reader=req.body?.getReader();let raw='',total=0;const decoder=new TextDecoder();
  if(!reader)return reply(400,{error:'invalid_input'});
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>60000){await reader.cancel();return reply(413,{error:'invalid_input'});}raw+=decoder.decode(value,{stream:true});}
  const input=JSON.parse(raw),action=input.action;
  if(['list','review','initial_review','admin_media'].includes(action)){
   const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
   if(!token)return reply(401,{error:'unauthorized'});
   const {data,error}=await db.auth.getUser(token);
   if(error||!data.user)return reply(401,{error:'unauthorized'});
   const actor=data.user.id;
   if(action==='review'||action==='initial_review'){
    if(!UUID.test(input.id||'')||!Number.isSafeInteger(input.version))throw Error('invalid_input');
    return reply(200,{ok:true,...await rpc(action,{actor,id:input.id,version:input.version,review:input.review})});
   }
   if(action==='admin_media'){
    if(!UUID.test(input.id||''))throw Error('invalid_input');
    const media=await rpc('admin_media',{actor,id:input.id});
    const result=await Promise.all(media.map(async(m:any)=>{const signed=await db.storage.from(bucket).createSignedUrl(m.path,300);if(signed.error)throw Error('media_unavailable');return {...m,url:signed.data.signedUrl};}));
    return reply(200,{ok:true,media:result});
   }
   let result=await rpc('list',{actor});
   // Bring older submissions into the same saved composition before showing the reviewer.
   const legacy=result.items.filter((s:any)=>!s.payload.presentation);
   for(const s of legacy)await rpc('format_legacy',{actor,id:s.id,version:s.version,presentation:buildStoryPresentation(s.payload.body,s.payload.media)});
   if(legacy.length)result=await rpc('list',{actor});
   return reply(200,{ok:true,...result});
  }
  if(!UUID.test(input.id||'')||!/^[0-9a-f]{64}$/.test(input.token||''))throw Error('invalid_input');
  const capability_hash=await digest(input.token),cap={id:input.id,capability_hash};
  if(action==='prepare'){
   if(input.website)throw Error('invalid_input');
   const payload=validateSubmission(input.payload||{});
   payload.media=payload.media.map((m:any)=>({...m,path:`Mplus/${input.id}/${m.slot}.${m.extension}`}));
   // Salt IP hashes with an existing server-only key; do not retain raw IP addresses.
   const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
   const result=await rpc('prepare',{...cap,ip_hash:await digest(key+ip),payload});
   if(result.status!=='uploading')return reply(200,{ok:true,id:input.id,status:result.status,uploads:[]});
   const uploads=await Promise.all(result.media.map(async(m:any)=>{const signed=await db.storage.from(bucket).createSignedUploadUrl(m.path,{upsert:false});if(signed.error)throw Error('upload_unavailable');return {slot:m.slot,url:signed.data.signedUrl};}));
   return reply(200,{ok:true,id:input.id,status:result.status,uploads});
  }
  if(action==='status'){
   const result=await rpc('status',cap);return reply(200,{ok:true,id:result.id,status:result.status});
  }
  if(action==='submit'){
   const current=await rpc('status',cap);
   if(current.status==='uploading'){
    // Inspect the private stored object's bytes as well as Storage metadata before accepting it.
    for(const m of current.media){
     const path=m.path.split('/').map(encodeURIComponent).join('/');
     const response=await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}`,{headers:{authorization:`Bearer ${key}`,apikey:key,range:'bytes=0-63'},signal:AbortSignal.timeout(12000)});
     if(!response.ok||!response.body)throw Error('upload_incomplete');
     const reader=response.body.getReader(),prefix=new Uint8Array(64);let count=0;
     while(count<64){const chunk=await reader.read();if(chunk.done)break;const part=chunk.value.subarray(0,64-count);prefix.set(part,count);count+=part.length;}
     await reader.cancel();
     if(!matchesMagic(prefix.subarray(0,count),m.type))throw Error('invalid_media');
    }
   }
   // The database stores this plan atomically before entering pending / queuing LINE.
   if(current.status==='uploading'&&typeof current.layout_body!=='string')throw Error('layout_required');
   const presentation=current.status==='uploading'?buildStoryPresentation(current.layout_body,current.media):undefined;
   const result=await rpc('submit',{...cap,presentation});return reply(200,{ok:true,id:result.id,status:result.status});
  }
  throw Error('invalid_action');
 }catch(error){
  const message=error instanceof Error?error.message:'unavailable';
  const known=['invalid_action','invalid_input','invalid_contact','invalid_files','content_required','consent_required','not_found','expired','request_conflict','version_conflict','rate_limited','upload_incomplete','invalid_media','forbidden','note_required','invalid_state','initial_review_required','layout_required','media_unavailable','upload_unavailable'];
  const code=known.find(x=>message===x)||'unavailable';
  return reply(code==='forbidden'?403:code==='rate_limited'?429:code==='unavailable'?503:400,{ok:false,error:code});
 }
});
