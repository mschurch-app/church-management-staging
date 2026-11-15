import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {validatePlan,UUID,jpegSize} from '../../../testimony-carousel-model.mjs';
const APP='https://mscos.mchurch.online',BUCKET='testimony-private',TABLE='testimony_instagram_jobs';
const hash=async(bytes:any)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const safe=(row:any)=>row&&Object.fromEntries(['id','submission_id','source_version','plan','status','scheduled_at','container_id','instagram_media_id','permalink','error_code','updated_at'].map(k=>[k,row[k]]));
const fail=(s:string):never=>{throw Error(s);};
export function createHandler(db:any,serviceKey:string,fetcher:typeof fetch=fetch){
 async function source(id:string){const r=await db.rpc('testimony_instagram_source',{p_id:id});if(r.error||!r.data)fail('not_found');return r.data;}
 function eligible(s:any){if(s.status!=='published'||s.payload.consent!==true)fail('source_not_published');if(s.payload.media?.length&&s.payload.media_consent!==true)fail('consent_required');}
 async function checkpoint(job:any,values:any){const r=await db.from(TABLE).update({...values,updated_at:new Date().toISOString()}).eq('id',job.id).eq('attempt_id',job.attempt_id).select('id').maybeSingle();if(r.error||!r.data)fail('checkpoint_failed');Object.assign(job,values);}
 async function graph(path:string,token:string,method='GET',params:Record<string,string>={}){
  const u=new URL('https://graph.instagram.com/v24.0/'+path);const opts:any={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000),redirect:'error'};
  if(method==='GET')Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));else{opts.headers['content-type']='application/x-www-form-urlencoded';opts.body=new URLSearchParams(params);}
  const response=await fetcher(u,opts),r=await response.json().catch(()=>({}));if(!response.ok||r.error)fail(r.error?.code===190?'token_expired':'instagram_api');return r;
 }
 async function token(connection:any){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${serviceKey}:instagram-publishing:v1`));const k=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']);const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(connection.access_token_iv)},k,bytes(connection.access_token_ciphertext)));}
 async function imagesReady(job:any){
  for(const image of job.images){const r=await db.storage.from(BUCKET).download(image.path);if(r.error||!r.data)fail('upload_incomplete');const bytes=new Uint8Array(await r.data.arrayBuffer());const size=jpegSize(bytes);if(size.width!==1080||size.height!==1350||bytes.length>8*1024**2||await hash(bytes)!==image.sha256)fail('invalid_image');}
 }
 async function run(job:any){
  const attempt=crypto.randomUUID(),now=new Date().toISOString();const claimed=await db.from(TABLE).update({status:'processing',attempt_id:attempt,lease_expires_at:new Date(Date.now()+180000).toISOString(),updated_at:now}).eq('id',job.id).eq('status',job.status).eq('updated_at',job.updated_at).select('*').maybeSingle();if(claimed.error||!claimed.data)return {status:'busy'};job=claimed.data;
  try{
   const s=await source(job.submission_id);eligible(s);if(s.version!==job.source_version)fail('source_changed');
   if(!job.approved_at||!job.consent_confirmed_at)fail('approval_required');if(job.approved_by!=='00000000-0000-4000-8000-000000000000'){const rights=await db.rpc('testimony_service',{p_action:'list',p_input:{actor:job.approved_by}});if(rights.error||rights.data?.can_approve!==true)fail('approver_inactive');}
   validatePlan(job.plan,job.submission_id);await imagesReady(job);
   const r=await db.from('instagram_publishing_connections').select('*').eq('church_id','M+').eq('status','connected').maybeSingle();if(r.error||!r.data)fail('not_connected');const connection=r.data,t=await token(connection),ig=connection.instagram_user_id;
   const profile=await graph('me',t,'GET',{fields:'user_id,username'});if(String(profile.user_id||profile.id)!==String(ig))fail('channel_mismatch');
   if(job.publish_started_at){
    const state=await graph(job.container_id,t,'GET',{fields:'status_code'});
    if(state.status_code==='PUBLISHED'){
     const recent=await graph(`${ig}/media`,t,'GET',{fields:'id,caption,permalink,timestamp',limit:'25'});const matches=(recent.data||[]).filter((m:any)=>m.caption===job.plan.caption&&Date.parse(m.timestamp)>=Date.parse(job.publish_started_at)-300000);
     if(matches.length===1){await checkpoint(job,{status:'published',instagram_media_id:matches[0].id,permalink:matches[0].permalink,published_at:now,lease_expires_at:null,error_code:null});return safe(job);}
    }
    await checkpoint(job,{status:'uncertain',lease_expires_at:null,error_code:'publish_result_unknown'});return safe(job);
   }
   const childIds=[...job.child_ids];
   for(let i=childIds.length;i<job.images.length;i++){
    const signed=await db.storage.from(BUCKET).createSignedUrl(job.images[i].path,3600);if(signed.error)fail('media_unavailable');
    const child=await graph(`${ig}/media`,t,'POST',{image_url:signed.data.signedUrl,is_carousel_item:'true',alt_text:(i===0?job.plan.title:i===job.images.length-1?'掃碼閱讀完整見證':job.plan.slides[i-1].text).slice(0,1000)});if(!child.id)fail('instagram_api');childIds.push(String(child.id));await checkpoint(job,{child_ids:childIds});
   }
   if(!job.container_id){const parent=await graph(`${ig}/media`,t,'POST',{media_type:'CAROUSEL',children:childIds.join(','),caption:job.plan.caption,...(job.plan.cover_illustration?{is_ai_generated:'true'}:{})});if(!parent.id)fail('instagram_api');await checkpoint(job,{container_id:String(parent.id)});}
   const state=await graph(job.container_id,t,'GET',{fields:'status_code'});
   if(state.status_code==='IN_PROGRESS'){await checkpoint(job,{status:'scheduled',lease_expires_at:null});return safe(job);}
   if(state.status_code!=='FINISHED')fail('instagram_processing');
   const latest=await source(job.submission_id);eligible(latest);if(latest.version!==job.source_version)fail('source_changed');
   await checkpoint(job,{publish_started_at:new Date().toISOString()});
   const published=await graph(`${ig}/media_publish`,t,'POST',{creation_id:job.container_id});if(!published.id)fail('publish_result_unknown');
   // Preserve the returned media id before a separate permalink read can fail.
   await checkpoint(job,{status:'published',instagram_media_id:String(published.id),published_at:new Date().toISOString(),lease_expires_at:null,error_code:null});
   try{const info=await graph(published.id,t,'GET',{fields:'permalink'});if(info.permalink)await checkpoint(job,{permalink:info.permalink});}catch{/* Published id remains authoritative. */}
   return safe(job);
  }catch(e){const code=e instanceof Error?e.message:'unavailable';await checkpoint(job,{status:job.publish_started_at?'uncertain':'failed',error_code:code,lease_expires_at:null});return safe(job);}
 }
 return async(req:Request)=>{
  const origin=req.headers.get('origin')||'',headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...(origin===APP?{'access-control-allow-origin':APP,'vary':'Origin'}:{})};
  const reply=(status:number,data:any)=>new Response(JSON.stringify(data),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:origin===APP?204:403,headers:{...headers,'access-control-allow-headers':'content-type,authorization,apikey','access-control-allow-methods':'POST,OPTIONS'}});
  if(req.method!=='POST')return reply(405,{ok:false,error:'method_rejected'});
  try{
   if(Number(req.headers.get('content-length')||0)>30000)fail('invalid_input');const reader=req.body?.getReader();if(!reader)throw Error('invalid_input');let raw='',total=0;const decoder=new TextDecoder();while(true){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>30000){await reader.cancel();fail('invalid_input');}raw+=decoder.decode(r.value,{stream:true});}raw+=decoder.decode();const b=JSON.parse(raw);
   if(b.action==='run_due'){
    const secret=req.headers.get('x-cron-secret')||'';if(!secret||(await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret})).data!==true)return reply(403,{ok:false,error:'forbidden'});
    const r=await db.from(TABLE).select('*').in('status',['scheduled','processing','uncertain']).lte('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(10);if(r.error)fail('database');
    const job=(r.data||[]).find((j:any)=>(!j.lease_expires_at||Date.parse(j.lease_expires_at)<Date.now())&&(j.status!=='uncertain'||Date.parse(j.updated_at)<Date.now()-300000));
    return reply(200,{ok:true,result:job?await run(job):{status:'idle'}});
   }
   if(origin!==APP&&!req.headers.get('x-cron-secret'))return reply(403,{ok:false,error:'forbidden'});
   const secret=req.headers.get('x-cron-secret')||'';const internal=Boolean(secret)&&(await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret})).data===true;
   if(origin!==APP&&!internal)return reply(403,{ok:false,error:'forbidden'});
   const bearer=(req.headers.get('authorization')||'').match(/^Bearer (\S+)$/)?.[1];if(!internal&&!bearer)return reply(401,{ok:false,error:'unauthorized'});
   const auth=internal?null:await db.auth.getUser(bearer);if(!internal&&(auth.error||!auth.data.user))return reply(401,{ok:false,error:'unauthorized'});const actor=internal?'00000000-0000-4000-8000-000000000000':auth.data.user.id;
   if(!internal){const rights=await db.rpc('testimony_service',{p_action:'list',p_input:{actor}});if(rights.error||rights.data?.can_approve!==true)return reply(403,{ok:false,error:'forbidden'});}
   if(!UUID.test(b.submissionId||''))fail('invalid_input');const s=await source(b.submissionId);eligible(s);
   const found=await db.from(TABLE).select('*').eq('submission_id',s.id).maybeSingle();if(found.error)fail('database');const existing=found.data;
   if(b.action==='status')return reply(200,{ok:true,job:safe(existing)});
   if(b.action==='prepare'){
    if(b.version!==s.version)fail('source_changed');if(existing&&['processing','published','uncertain'].includes(existing.status))return reply(200,{ok:true,job:safe(existing),uploads:[]});
    const plan=validatePlan(b.plan,s.id);if(plan.display_name!==s.payload.display_name)fail('display_name_changed');
    if(plan.cover_slot===null){if(b.noPhotoConfirmed!==true)fail('photo_required');}else if(!s.payload.media.some((m:any)=>m.slot===plan.cover_slot&&m.kind==='photo'&&['image/jpeg','image/png','image/webp'].includes(m.type)))fail('photo_required');
    if(!Array.isArray(b.hashes)||b.hashes.length!==plan.slides.length+2||b.hashes.some((h:any)=>!/^[a-f0-9]{64}$/.test(h)))fail('invalid_input');
    const id=existing?.id||crypto.randomUUID(),revision=crypto.randomUUID(),images=b.hashes.map((sha256:string,index:number)=>({sha256,path:`Mplus/${s.id}/instagram/${id}/${revision}/${index}-${sha256}.jpg`}));
    const row={id,submission_id:s.id,source_version:s.version,plan,images,status:'draft',scheduled_at:null,approved_at:null,approved_by:null,consent_confirmed_at:null,consent_confirmed_by:null,child_ids:[],container_id:null,publish_started_at:null,error_code:null,created_by:actor,updated_at:new Date().toISOString()};
    const write=existing?db.from(TABLE).update(row).eq('id',id).eq('updated_at',existing.updated_at).in('status',['draft','scheduled','failed','cancelled']).select('*').maybeSingle():db.from(TABLE).insert(row).select('*').single();const saved=await write;if(saved.error||!saved.data)fail('version_conflict');
    const uploads=await Promise.all(images.map(async(image:any)=>{const signed=await db.storage.from(BUCKET).createSignedUploadUrl(image.path,{upsert:false});if(signed.error)fail('upload_unavailable');return signed.data.signedUrl;}));
    return reply(200,{ok:true,job:safe(saved.data),uploads});
   }
   if(!existing)fail('not_found');if(b.revision!==existing.updated_at)fail('version_conflict');
   if(b.action==='restart'){
    if(existing.status!=='published'||b.confirmedRemoved!==true||b.previousMediaId!==existing.instagram_media_id)fail('invalid_state');
    const connection=await db.from('instagram_publishing_connections').select('*').eq('church_id','M+').eq('status','connected').maybeSingle();if(connection.error||!connection.data)fail('not_connected');const t=await token(connection.data);
    const me=await graph('me',t,'GET',{fields:'user_id'});if(String(me.user_id||me.id)!==String(connection.data.instagram_user_id))fail('channel_mismatch');
    const old=await fetcher('https://graph.instagram.com/v24.0/'+existing.instagram_media_id+'?fields=id',{headers:{authorization:'Bearer '+t},signal:AbortSignal.timeout(20000)}),oldData=await old.json().catch(()=>({}));
    if(old.ok)fail('previous_post_still_exists');if(oldData.error?.code!==100||oldData.error?.error_subcode!==33)fail('removal_not_verified');
    const history=[...(existing.publication_history||[]),{media_id:existing.instagram_media_id,permalink:existing.permalink,published_at:existing.published_at,plan:existing.plan,images:existing.images,removed_confirmed_by:actor,removed_confirmed_at:new Date().toISOString()}];
    const r=await db.from(TABLE).update({status:'draft',publication_history:history,child_ids:[],container_id:null,instagram_media_id:null,permalink:null,publish_started_at:null,scheduled_at:null,approved_at:null,approved_by:null,consent_confirmed_at:null,consent_confirmed_by:null,error_code:null,updated_at:new Date().toISOString()}).eq('id',existing.id).eq('updated_at',existing.updated_at).select('*').maybeSingle();if(r.error||!r.data)fail('version_conflict');return reply(200,{ok:true,job:safe(r.data)});
   }
   if(b.action==='schedule'){
    if(!['draft','failed'].includes(existing.status)||existing.publish_started_at)fail('invalid_state');if(b.confirmed!==true||b.consentConfirmed!==true)fail('approval_required');if(s.version!==existing.source_version)fail('source_changed');
    const date=Date.parse(b.scheduledAt);if(!Number.isFinite(date)||date<Date.now()-60000||date>Date.now()+366*86400000)fail('invalid_schedule');await imagesReady(existing);
    const now=new Date().toISOString(),saved=await db.from(TABLE).update({status:'scheduled',scheduled_at:new Date(date).toISOString(),approved_at:now,approved_by:actor,consent_confirmed_at:now,consent_confirmed_by:actor,error_code:null,updated_at:now}).eq('id',existing.id).eq('updated_at',existing.updated_at).select('*').maybeSingle();if(saved.error||!saved.data)fail('version_conflict');return reply(200,{ok:true,job:safe(saved.data)});
   }
   if(b.action==='cancel'){
    if(!['draft','scheduled','failed'].includes(existing.status)||existing.publish_started_at)fail('invalid_state');const r=await db.from(TABLE).update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',existing.id).eq('updated_at',existing.updated_at).select('*').maybeSingle();if(r.error||!r.data)fail('version_conflict');return reply(200,{ok:true,job:safe(r.data)});
   }
   return reply(400,{ok:false,error:'invalid_action'});
  }catch(e){const error=e instanceof Error?e.message:'unavailable';const known=['invalid_input','invalid_plan','link_required','not_found','source_not_published','consent_required','source_changed','approval_required','photo_required','display_name_changed','version_conflict','invalid_state','invalid_schedule','upload_incomplete','invalid_image','upload_unavailable','invalid_action','previous_post_still_exists','removal_not_verified'];return reply(known.includes(error)?400:503,{ok:false,error:known.includes(error)?error:'unavailable'});}
 };
}
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(createHandler(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),key));
