import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {UUID,cleanStory,validateManifest,validateSubmission,validateCover,composeMessage,generationPrompt,validateGeneratedFacts,freshDesignPrompt} from '../../../association-story-model.mjs';
import {jpegSize} from '../../../testimony-carousel-model.mjs';
const TARGET_PAGE='311251732221816';
// Facebook exposes both a public profile ID and the Page API ID for this same tcsca Page.
const TARGET_PAGE_IDS=[TARGET_PAGE,'100064745854212'];
const APP='https://mscos.mchurch.online',BUCKET='association-story-private',TABLE='association_stories',SETTINGS='association_story_settings';
const hash=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=(code:string):never=>{throw Error(code);};
const known=new Set(['forbidden','not_found','version_conflict','invalid_state','invalid_input','invalid_image','photo_count','content_required','consent_required','upload_incomplete','reviewer_unavailable','comment_required','facebook_not_connected','channel_mismatch','generation_changed_facts','generation_unavailable','design_unavailable','design_in_progress','ai_photo_consent_required','design_photos_too_large','invalid_key_points','publication_unknown','configuration_failed','cover_outdated']);
export function createHandler(db:any,serviceKey:string,env:Record<string,string>={},fetcher:typeof fetch=fetch){
 async function rights(actor:string){const r=await db.rpc('association_story_access',{p_actor:actor});if(r.error||!r.data)fail('forbidden');return r.data;}
 async function config(){const r=await db.from(SETTINGS).select('*').eq('id',true).single();if(r.error)fail('configuration_failed');return r.data;}
 async function key(){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serviceKey+':association-facebook:v1')),{name:'AES-GCM'},false,['encrypt','decrypt']);}
 const b64=(a:Uint8Array)=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);},un64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function decrypt(c:any){if(!c.page_id||!c.token_ciphertext)fail('facebook_not_connected');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(c.token_iv)},await key(),un64(c.token_ciphertext)));}
 async function graph(path:string,token:string,method='GET',params:Record<string,string>={}){
  const url=new URL('https://graph.facebook.com/v24.0/'+path),options:any={method,headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(25000),redirect:'error'};
  if(method==='GET')Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));else{options.headers['content-type']='application/x-www-form-urlencoded';options.body=new URLSearchParams(params);}
  const r=await fetcher(url,options),data=await r.json().catch(()=>({}));if(!r.ok||data.error)fail(data.error?.code===190?'facebook_token_expired':'facebook_api');return data;
 }
 async function photoBytes(image:any){const r=await db.storage.from(BUCKET).download(image.path);if(r.error||!r.data)fail('upload_incomplete');const bytes=new Uint8Array(await r.data.arrayBuffer()),size=jpegSize(bytes);if(bytes.length!==image.bytes||await hash(bytes)!==image.sha256||size.width<1||size.height<1||size.width>2400||size.height>2400)fail('invalid_image');return bytes;}
 async function imagesReady(row:any){validateManifest(row.images);for(const image of row.images)await photoBytes(image);}
 async function coverReady(row:any){const cover=validateCover(row),bytes=await photoBytes(cover),size=jpegSize(bytes);if(size.width!==1080||size.height!==1350)fail('invalid_image');}
 async function load(id:string,actor:string,access:any){const r=await db.from(TABLE).select('*').eq('id',id).maybeSingle();if(r.error||!r.data)fail('not_found');if(!access.reviewer&&r.data.created_by!==actor)fail('forbidden');return r.data;}
 async function present(row:any){const urls=await Promise.all(row.images.map(async(image:any)=>{const r=await db.storage.from(BUCKET).createSignedUrl(image.path,900);return r.error?null:r.data.signedUrl;}));const safe={...row};delete safe.attempt_id;delete safe.approved_snapshot;delete safe.facebook_photo_ids;let cover_url=null;if(row.cover){const r=await db.storage.from(BUCKET).createSignedUrl(row.cover.path,900);if(!r.error)cover_url=r.data.signedUrl;}let design_url=null;if(row.design_art?.path){const r=await db.storage.from('association-story-art').createSignedUrl(row.design_art.path,900);if(!r.error)design_url=r.data.signedUrl;}return {...safe,photo_urls:urls,cover_url,design_url};}
 async function transition(row:any,actor:string,action:string,comment=''){const r=await db.rpc('association_story_transition',{p_actor:actor,p_id:row.id,p_version:row.version,p_action:action,p_comment:comment});if(r.error)fail(known.has(r.error.message)?r.error.message:'version_conflict');return r.data;}
 async function checkpoint(row:any,patch:any){const r=await db.from(TABLE).update({...patch,updated_at:new Date().toISOString()}).eq('id',row.id).eq('attempt_id',row.attempt_id).select('*').maybeSingle();if(r.error||!r.data)fail('checkpoint_failed');Object.assign(row,r.data);}
 async function syncNews(row:any){
  if(!row.facebook_post_id||!row.approved_snapshot)fail('invalid_state');const source=row.approved_snapshot;if(!source.sync_news)return;
  try{
   if(!(await config()).news_widget_verified_at)fail('website_not_connected');
   const publicImages=[];
   for(const image of [source.cover]){const bytes=await photoBytes(image),path=`association-story-approved/${row.id}/${image.sha256}.jpg`;const uploaded=await db.storage.from('church-website-public-media').upload(path,bytes,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(uploaded.error)fail('news_image_upload');publicImages.push(db.storage.from('church-website-public-media').getPublicUrl(path).data.publicUrl);}
   const r=await db.from('association_news').upsert({source_key:'association-story:'+row.id,title:source.title,summary:source.body.slice(0,360),body:composeMessage(source),hero_image_url:publicImages[0],image_urls:publicImages,status:'published',published_at:row.published_at,created_by:row.created_by,updated_by:row.approved_by},{onConflict:'source_key'}).select('id').single();if(r.error)fail('news_write');
   const saved=await db.from(TABLE).update({news_id:r.data.id,news_status:'published',error_code:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('facebook_post_id',row.facebook_post_id).select('*').single();if(saved.error)fail('news_receipt');Object.assign(row,saved.data);
  }catch{const r=await db.from(TABLE).update({news_status:'failed',error_code:'news_sync_failed',updated_at:new Date().toISOString()}).eq('id',row.id).select('*').single();if(r.data)Object.assign(row,r.data);}
 }
 async function publish(row:any){
  if(row.facebook_post_id){if(row.news_status==='failed'||row.news_status==='pending')await syncNews(row);return row;}
  if(!['approved','failed','publishing','uncertain'].includes(row.status))fail('invalid_state');
  if(row.status==='uncertain'||row.facebook_started_at)fail('publication_unknown');
  if(row.status==='publishing'&&Date.parse(row.lease_expires_at)>Date.now())return row;
  const r=await db.from(TABLE).update({status:'publishing',attempt_id:crypto.randomUUID(),lease_expires_at:new Date(Date.now()+180000).toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).eq('status',row.status).eq('updated_at',row.updated_at).select('*').maybeSingle();if(r.error||!r.data)fail('version_conflict');row=r.data;
  try{
   if(!(await rights(row.approved_by)).reviewer)fail('forbidden');const source=row.approved_snapshot;if(!source||!source.consent_confirmed)fail('consent_required');await imagesReady(source);await coverReady(source);
   const c=await config(),token=await decrypt(c),me=await graph('me',token,'GET',{fields:'id,name'});if(me.id!==c.page_id||!TARGET_PAGE_IDS.includes(String(me.id)))fail('channel_mismatch');
   // Bind a draft permanently to the Page approved on its first publishing attempt.
   if(source.page_id&&source.page_id!==c.page_id)fail('channel_mismatch');
   if(!source.page_id){source.page_id=c.page_id;await checkpoint(row,{approved_snapshot:source});}
   const ids=[...row.facebook_photo_ids];
   for(let i=ids.length;i<1;i++){
    const signed=await db.storage.from(BUCKET).createSignedUrl(source.cover.path,3600);if(signed.error)fail('upload_incomplete');
    const photo=await graph(c.page_id+'/photos',token,'POST',{url:signed.data.signedUrl,published:'false'});if(!photo.id)fail('facebook_api');ids.push(String(photo.id));await checkpoint(row,{facebook_photo_ids:ids});
   }
   await checkpoint(row,{facebook_started_at:new Date().toISOString()});
   const post=await graph(c.page_id+'/feed',token,'POST',{message:composeMessage(source),attached_media:JSON.stringify(ids.map(id=>({media_fbid:id}))),published:'true'});if(!post.id)fail('publication_unknown');
   await checkpoint(row,{status:'published',facebook_post_id:String(post.id),facebook_permalink:'https://www.facebook.com/'+post.id,published_at:new Date().toISOString(),lease_expires_at:null,error_code:null});
   try{const info=await graph(post.id,token,'GET',{fields:'id,permalink_url'});if(info.permalink_url)await checkpoint(row,{facebook_permalink:info.permalink_url});}catch{/* Keep authoritative returned post id. */}
   await syncNews(row);return row;
  }catch(e){const code=e instanceof Error?e.message:'unavailable';await checkpoint(row,{status:row.facebook_started_at?'uncertain':'failed',error_code:code,lease_expires_at:null});return row;}
 }
 async function reconcile(row:any){
  if(row.facebook_post_id)return row;if(!row.facebook_started_at||!row.approved_snapshot)fail('invalid_state');if(row.status==='publishing'&&Date.parse(row.lease_expires_at)>Date.now())return row;
  const c=await config(),token=await decrypt(c);if(row.approved_snapshot.page_id!==c.page_id)fail('channel_mismatch');
  const response=await graph(c.page_id+'/feed',token,'GET',{fields:'id,message,created_time,permalink_url,is_published,attachments{subattachments{target},target}',limit:'100',since:String(Math.floor(Date.parse(row.facebook_started_at)/1000)-60)});
  const matches=(response.data||[]).filter((post:any)=>{if(post.is_published!==true||post.message!==composeMessage(row.approved_snapshot)||Math.abs(Date.parse(post.created_time)-Date.parse(row.facebook_started_at))>300000)return false;const attachments=post.attachments?.data||[],ids=attachments.flatMap((a:any)=>a.subattachments?.data?.map((x:any)=>String(x.target?.id))||[String(a.target?.id)]);return ids.length===row.facebook_photo_ids.length&&row.facebook_photo_ids.every((id:string)=>ids.includes(id));});
  if(matches.length!==1)fail('publication_unknown');const m=matches[0];
  const r=await db.from(TABLE).update({status:'published',facebook_post_id:m.id,facebook_permalink:m.permalink_url||'https://www.facebook.com/'+m.id,published_at:m.created_time,error_code:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('updated_at',row.updated_at).select('*').maybeSingle();if(r.error||!r.data)fail('version_conflict');row=r.data;await syncNews(row);return row;
 }
 return async(req:Request)=>{
  const origin=req.headers.get('origin')||'',headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin',...(origin===APP?{'access-control-allow-origin':APP}:{})};
  const reply=(code:number,data:any)=>new Response(JSON.stringify(data),{status:code,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:origin===APP?204:403,headers:{...headers,'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS'}});
  if(req.method!=='POST'||origin!==APP)return reply(403,{ok:false,error:'forbidden'});
  try{
   if(Number(req.headers.get('content-length')||0)>40000)fail('invalid_input');const reader=req.body?.getReader();if(!reader)throw Error('invalid_input');let total=0,raw='';const decoder=new TextDecoder();while(true){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>40000){await reader.cancel();fail('invalid_input');}raw+=decoder.decode(r.value,{stream:true});}const b=JSON.parse(raw+decoder.decode());
   if(b.action==='connect_ticket'){
    if(typeof b.ticket!=='string'||!/^[a-f0-9]{64}$/.test(b.ticket))fail('forbidden');
    const ticketHash=await hash(new TextEncoder().encode(b.ticket)),ticket=await db.from('association_story_connection_tickets').select('ticket_hash,expires_at,used_at,expected_page_id').eq('ticket_hash',ticketHash).maybeSingle();
    if(ticket.error||!ticket.data||ticket.data.used_at||Date.parse(ticket.data.expires_at)<=Date.now()||ticket.data.expected_page_id!==TARGET_PAGE)fail('forbidden');
    if(typeof b.pageToken!=='string'||b.pageToken.length<20||b.pageToken.length>2000)fail('invalid_input');
    const me=await graph('me',b.pageToken,'GET',{fields:'id,name'});if(!TARGET_PAGE_IDS.includes(String(me.id)))fail('channel_mismatch');
    await graph(me.id+'/published_posts',b.pageToken,'GET',{fields:'id',limit:'1'});
    const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(b.pageToken));
    const saved=await db.rpc('complete_association_story_connection',{p_hash:ticketHash,p_page_id:String(me.id),p_name:String(me.name),p_ciphertext:b64(new Uint8Array(cipher)),p_iv:b64(iv)});
    if(saved.error||saved.data!==true)fail('forbidden');
    return reply(200,{ok:true,page_id:me.id,page_name:me.name,encrypted:true,generation_ready:Boolean(env.GEMINI_API_KEY)});
   }
   const bearer=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!bearer)return reply(401,{ok:false,error:'login_required'});const auth=await db.auth.getUser(bearer);if(auth.error||!auth.data.user)return reply(401,{ok:false,error:'login_required'});const access=await rights(auth.data.user.id),actor=access.actor_id||auth.data.user.id;if(!access.reader&&!access.reviewer)return reply(403,{ok:false,error:'forbidden'});

   if(b.action==='profile'){const c=await config();return reply(200,{ok:true,user_id:actor,access,connection:{connected:Boolean(c.page_id&&c.token_ciphertext),page_id:c.page_id,page_name:c.page_name,page_url:c.page_url,target_page_id:TARGET_PAGE},generation_ready:Boolean(env.GEMINI_API_KEY),news_sync_ready:Boolean(c.news_widget_verified_at)});}
   if(b.action==='connect'){
    if(!access.reviewer)fail('forbidden');if(!/^\d{5,30}$/.test(b.pageId||'')||typeof b.pageToken!=='string'||b.pageToken.length<20||b.pageToken.length>2000)fail('invalid_input');
    const me=await graph('me',b.pageToken,'GET',{fields:'id,name'});if(!TARGET_PAGE_IDS.includes(String(b.pageId))||!TARGET_PAGE_IDS.includes(String(me.id)))fail('channel_mismatch');
    const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(b.pageToken));
    const r=await db.from(SETTINGS).update({page_id:me.id,page_name:me.name,page_url:'https://www.facebook.com/tcsca/',token_iv:b64(iv),token_ciphertext:b64(new Uint8Array(encrypted)),connected_by:actor,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',true).select('page_name').single();if(r.error)fail('configuration_failed');return reply(200,{ok:true,page_name:r.data.page_name});
   }
   if(b.action==='list'){
    let q=db.from(TABLE).select('id,title,status,created_by,version,updated_at,news_status,facebook_permalink,review_comment,deleted_at').order('updated_at',{ascending:false}).limit(60);q=b.trash===true?q.not('deleted_at','is',null):q.is('deleted_at',null);if(!access.reviewer)q=q.eq('created_by',actor);const r=await q;if(r.error)fail('unavailable');return reply(200,{ok:true,items:r.data});
   }
   if(!UUID.test(b.id||''))fail('invalid_input');
   if(b.action==='create'){
    if(!access.writer)fail('forbidden');const prior=await db.from(TABLE).select('*').eq('id',b.id).maybeSingle();if(prior.error)fail('unavailable');if(prior.data){if(prior.data.created_by!==actor)fail('forbidden');return reply(200,{ok:true,story:await present(prior.data)});}
    const r=await db.from(TABLE).insert({id:b.id,created_by:actor}).select('*').single();if(r.error)fail('version_conflict');return reply(200,{ok:true,story:await present(r.data)});
   }
   let row=await load(b.id,actor,access);if(b.action==='get')return reply(200,{ok:true,story:await present(row)});
   if(!Number.isInteger(b.version)||row.version!==b.version)fail('version_conflict');
   if(['trash','restore','delete_cover','restore_cover'].includes(b.action)){
    if(!access.writer||row.created_by!==actor||!['draft','changes_requested'].includes(row.status))fail('forbidden');
    const patch:any={version:row.version+1,updated_at:new Date().toISOString()};
    if(b.action==='trash'){if(row.deleted_at)fail('invalid_state');patch.deleted_at=new Date().toISOString();patch.deleted_by=actor;}
    else if(b.action==='restore'){if(!row.deleted_at)fail('invalid_state');patch.deleted_at=null;patch.deleted_by=null;}
    else{if(row.deleted_at)fail('invalid_state');const history=row.cover_history||[];
     if(b.action==='delete_cover'){if(!row.cover&&!row.design_art)fail('not_found');patch.cover_history=[...history,{id:crypto.randomUUID(),cover:row.cover,design_art:row.design_art,deleted_at:new Date().toISOString()}];patch.cover=null;patch.design_art=null;}
     else{const entry=history.find((x:any)=>x.id===b.coverId);if(!entry)fail('not_found');if(entry.cover)validateCover({...row,cover:entry.cover});patch.cover=entry.cover;patch.design_art=entry.design_art;patch.cover_history=history.filter((x:any)=>x.id!==b.coverId);if(row.cover||row.design_art)patch.cover_history.push({id:crypto.randomUUID(),cover:row.cover,design_art:row.design_art,deleted_at:new Date().toISOString()});}
    }
    const saved=await db.from(TABLE).update(patch).eq('id',row.id).eq('version',row.version).select('*').maybeSingle();if(saved.error||!saved.data)fail('version_conflict');return reply(200,{ok:true,story:await present(saved.data)});
   }
   if(row.deleted_at)fail('invalid_state');
   if(b.action==='design'){
    if(!access.writer||row.created_by!==actor||!['draft','changes_requested'].includes(row.status))fail('forbidden');if(b.aiPhotoConsent!==true)fail('ai_photo_consent_required');if(!env.GEMINI_API_KEY)fail('design_unavailable');if(!row.title.trim())fail('content_required');
    const job=crypto.randomUUID(),claim=await db.rpc('association_story_design_claim',{p_actor:actor,p_id:row.id,p_version:row.version,p_job:job});if(claim.error)fail(String(claim.error.message||'').includes('design_in_progress')?'design_in_progress':'version_conflict');
    try{
     validateManifest(row.images);const parts:any[]=[{text:freshDesignPrompt(row,job)}];let total=0;for(const image of row.images){const bytes=await photoBytes(image);total+=bytes.length;if(total>12*1024*1024)fail('design_photos_too_large');parts.push({inlineData:{mimeType:'image/jpeg',data:b64(bytes)}});}
     const response=await fetcher('https://generativelanguage.googleapis.com/v1/models/gemini-nano-banana-2.1:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(110000),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'4:5',imageSize:'1K'}}})});if(!response.ok)fail('design_unavailable');const value=await response.json(),art=value.candidates?.[0]?.content?.parts?.find((x:any)=>!x.thought&&x.inlineData?.data)?.inlineData;
     if(!art||!['image/png','image/jpeg'].includes(art.mimeType)||art.data.length>17*1024*1024)fail('design_unavailable');const bytes=un64(art.data);if(bytes.length<128||bytes.length>12*1024*1024)fail('design_unavailable');
     if(art.mimeType==='image/png'){if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)fail('design_unavailable');}else jpegSize(bytes);
     const path=`${actor}/${row.id}/${job}.${art.mimeType==='image/png'?'png':'jpg'}`,uploaded=await db.storage.from('association-story-art').upload(path,bytes,{contentType:art.mimeType,upsert:false});if(uploaded.error)fail('design_unavailable');
     const design_art={path,job_id:job,sha256:await hash(bytes),bytes:bytes.length,type:art.mimeType,title:row.title,key_points:row.key_points||'',subject_mode:row.subject_mode||'auto',layout_key:row.layout_key,theme_key:row.theme_key,layout_notes:row.layout_notes||'',source_hashes:row.images.map((x:any)=>x.sha256),model:'gemini-nano-banana-2.1',generated_at:new Date().toISOString()};
     const saved=await db.from(TABLE).update({design_art,design_lock:null,design_lock_at:null,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).eq('design_lock',job).select('*').maybeSingle();if(saved.error||!saved.data)fail('version_conflict');return reply(200,{ok:true,story:await present(saved.data)});
    }finally{await db.from(TABLE).update({design_lock:null,design_lock_at:null}).eq('id',row.id).eq('design_lock',job);}
   }
   if(['save','prepare','prepare_cover','generate','layout','submit'].includes(b.action)){
    if(!access.writer||row.created_by!==actor||!['draft','changes_requested'].includes(row.status))fail('forbidden');
    if(b.action==='submit'){validateSubmission(row);await imagesReady(row);await coverReady(row);row=await transition(row,actor,'submit');return reply(200,{ok:true,story:await present(row)});}
    let patch:any={version:row.version+1,updated_at:new Date().toISOString()};
    if(b.action==='prepare_cover'){if(b.designId){const a=row.design_art;if(!a||a.job_id!==b.designId||a.title!==row.title||a.key_points!==(row.key_points||'')||a.subject_mode!==(row.subject_mode||'auto')||a.layout_notes!==(row.layout_notes||'')||a.theme_key!==row.theme_key||a.layout_key!==row.layout_key||JSON.stringify(a.source_hashes)!==JSON.stringify(row.images.map((x:any)=>x.sha256)))fail('cover_outdated');}const file=validateManifest([b.file])[0];if(row.cover)patch.cover_history=[...(row.cover_history||[]),{id:crypto.randomUUID(),cover:row.cover,design_art:row.design_art?.job_id===row.cover.design_id?row.design_art:null,deleted_at:new Date().toISOString(),reason:'replaced'}];patch.cover={...file,path:`${actor}/${row.id}/covers/${crypto.randomUUID()}.jpg`,title:row.title,layout_key:row.layout_key,theme_key:row.theme_key,key_points:row.key_points||'',subject_mode:row.subject_mode||'auto',layout_notes:row.layout_notes||'',design_id:b.designId||null,source_hashes:row.images.map((x:any)=>x.sha256)};if(!row.title||row.images.length<1)fail('content_required');}
    else if(b.action==='prepare'){
     const files=validateManifest(b.files),revision=crypto.randomUUID();patch.images=files.map((file:any,i:number)=>({...file,path:`${actor}/${row.id}/${revision}/${i}-${file.sha256}.jpg`}));
    }else if(b.action==='save')patch={...patch,...cleanStory(b.story)};
    else{
     if(!env.GEMINI_API_KEY)fail('generation_unavailable');if(!row.description.trim())fail('content_required');await imagesReady(row);
     const r=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(45000),body:JSON.stringify({contents:[{role:'user',parts:[{text:generationPrompt(row.description)+'\n版面需求（僅供選擇布局與配色，不是事件事實）：'+JSON.stringify(row.layout_notes)+(b.action==='layout'?'\n只調整版面，title 與 body 保持原稿；只需輸出 layout_key 與 theme_key。':'')}]}],generationConfig:{temperature:0.2,maxOutputTokens:b.action==='layout'?1024:12000,responseMimeType:'application/json'}})});if(!r.ok)fail('generation_unavailable');const result=await r.json(),value=result.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('');let parsed;try{parsed=JSON.parse(value);}catch{fail('generation_unavailable');}const cleaned=cleanStory({...row,...(b.action==='layout'?{}:{title:parsed.title,body:parsed.body,key_points:Array.isArray(parsed.key_points)?parsed.key_points.join('\n'):(parsed.key_points||row.key_points||'')}),layout_key:b.action==='layout'?(parsed.layout_key||row.layout_key):row.layout_key,theme_key:b.action==='layout'?(parsed.theme_key||row.theme_key):row.theme_key});if(!cleaned.title||!cleaned.body||/https?:\/\//i.test(cleaned.body))fail('generation_unavailable');if(b.action!=='layout'){validateGeneratedFacts(row.description,cleaned.title+'\n'+cleaned.body+'\n'+cleaned.key_points);patch.title=cleaned.title;patch.body=cleaned.body;patch.key_points=cleaned.key_points;}patch.layout_key=cleaned.layout_key;patch.theme_key=cleaned.theme_key;
    }
    const saved=await db.from(TABLE).update(patch).eq('id',row.id).eq('version',row.version).in('status',['draft','changes_requested']).select('*').maybeSingle();if(saved.error||!saved.data)fail('version_conflict');row=saved.data;
    const uploads=['prepare','prepare_cover'].includes(b.action)?await Promise.all((b.action==='prepare_cover'?[row.cover]:row.images).map(async(image:any)=>{const r=await db.storage.from(BUCKET).createSignedUploadUrl(image.path,{upsert:false});if(r.error)fail('upload_incomplete');return r.data.signedUrl;})):undefined;
    return reply(200,{ok:true,story:await present(row),uploads});
   }
   if(!access.reviewer)fail('forbidden');
   if(b.action==='return')row=await transition(row,actor,'return',String(b.comment||'').slice(0,2000));
   else if(b.action==='approve'){
    if(b.confirmed!==true)fail('consent_required');validateSubmission(row);await imagesReady(row);await coverReady(row);const c=await config();if(!c.page_id||!c.token_ciphertext)fail('facebook_not_connected');
    row=await transition(row,actor,'approve');row=await publish(row);
   }else if(b.action==='retry')row=row.facebook_started_at&&!row.facebook_post_id?await reconcile(row):await publish(row);
   else if(b.action==='reconcile')row=await reconcile(row);
   else fail('invalid_input');
   return reply(200,{ok:true,story:await present(row)});
  }catch(e){const code=e instanceof Error?e.message:'unavailable';return reply(code==='forbidden'?403:known.has(code)?400:503,{ok:false,error:known.has(code)?code:'unavailable'});}
 };
}
if(typeof Deno!=='undefined'){const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;Deno.serve(createHandler(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),key,{GEMINI_API_KEY:Deno.env.get('GEMINI_API_KEY')||''}));}
