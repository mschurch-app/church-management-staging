import {STORY_LAYOUTS,STORY_THEMES} from '../../../association-story-model.mjs';
import {canvaClient} from './canva-client.mjs';
const TABLE='association_story_canva_jobs',BUCKET='association-story-art',ID=/^[a-zA-Z0-9_-]{5,150}$/;
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const canvaSnapshot=row=>({title:row.title,key_points:row.key_points||'',subject_mode:row.subject_mode||'auto',layout_key:row.layout_key,theme_key:row.theme_key,layout_notes:row.layout_notes||'',source_hashes:row.images.map(x=>x.sha256)});
export const canvaSnapshotHash=row=>digest(new TextEncoder().encode(JSON.stringify(canvaSnapshot(row))));
export function publicCanvaJob(job){return job?{id:job.id,status:job.status,stage:job.stage,error_code:job.error_code||null,next_poll_at:job.next_poll_at,design_url:job.design_id?'https://www.canva.com/design/'+job.design_id+'/edit':null}:null;}
export function canvaStoryJobs({db,env,fetcher=fetch,jpegSize}){
 const client=canvaClient({db,env,fetcher});
 async function latest(storyId){const r=await db.from(TABLE).select('*').eq('story_id',storyId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw Error('canva_unavailable');return r.data;}
 async function start(row,actor,id){
  if(row.subject_mode==='cutout')throw Error('canva_cutout_not_supported');
  const hash=await canvaSnapshotHash(row),existing=await db.from(TABLE).select('*').eq('id',id).maybeSingle();if(existing.error)throw Error('canva_unavailable');if(existing.data){if(existing.data.actor_id!==actor||existing.data.story_id!==row.id||existing.data.snapshot_hash!==hash)throw Error('forbidden');return existing.data;}
  const current=await latest(row.id);if(current?.status==='working'){if(current.snapshot_hash===hash)return current;throw Error('design_in_progress');}
  const conn=await client.connection();if(!conn.configured)throw Error('canva_configuration_required');if(!conn.connected)throw Error('canva_connection_required');
  const input={...canvaSnapshot(row),photo_count:row.images.length};const r=await db.from(TABLE).insert({id,story_id:row.id,actor_id:actor,snapshot_hash:hash,input,status:'working',stage:'queued'}).select('*').single();if(r.error){const active=await latest(row.id);if(active?.status==='working'&&active.snapshot_hash===hash)return active;throw Error('canva_unavailable');}return r.data;
 }
 async function save(job,lease,patch){const r=await db.from(TABLE).update({...patch,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease',lease).select('*').single();if(r.error||!r.data)throw Error('canva_receipt_failed');Object.assign(job,r.data);}
 function brief(input){return `製作一頁精緻的社群故事視覺背景，只要一頁，不要封面以外的其他頁。主題意境：${input.title}。重點意境：${input.key_points}。色調方向：${STORY_THEMES[input.theme_key]||input.theme_key}。設計氛圍：${STORY_LAYOUTS[input.layout_key]||input.layout_key}。美術需求：${input.layout_notes}。每次全新創作，陽光、細膩、具質感，有精緻插畫、紙材紋理和層次，不使用白色大片底。不使用固定品牌模板。不要產生人物照片、肖像、姓名、網址、文字或數字。這個作品稍後會由教會OS加入${input.photo_count}張真實照片與繁體中文標題、重點；請將裝飾集中四周，中央區域保留乾淨、低對比的呼吸空間，避免重要插畫被照片遮住。整體預計用於4:5直式社群貼文。`;
 }
 async function download(url){let u;try{u=new URL(url);}catch{throw Error('canva_invalid_export');}if(u.protocol!=='https:'||u.port||u.username||u.password||!['canva.com','canva.ai'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))throw Error('canva_invalid_export');const r=await fetcher(u,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok||!r.body||!r.headers.get('content-type')?.startsWith('image/jpeg'))throw Error('canva_invalid_export');const parts=[];let size=0;const reader=r.body.getReader();while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>12*1024*1024){await reader.cancel();throw Error('canva_invalid_export');}parts.push(x.value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}const dims=jpegSize(bytes);if(dims.width!==1080||dims.height!==1350)throw Error('canva_invalid_export');return bytes;}
 async function advance(job){if(job.status!=='working'||job.next_poll_at&&Date.parse(job.next_poll_at)>Date.now())return job;
  const lease=crypto.randomUUID(),claim=await db.rpc('claim_association_canva_job',{p_id:job.id,p_actor:job.actor_id,p_lease:lease});if(claim.error)throw Error('canva_unavailable');if(claim.data!==true)return job;
  let posting=false;
  try{
   // Re-read after acquiring the lease; another request may already have advanced the stage.
   const fresh=await db.from(TABLE).select('*').eq('id',job.id).eq('lease',lease).single();if(fresh.error||!fresh.data)throw Error('canva_unavailable');Object.assign(job,fresh.data);
   if(job.status!=='working')return job;
   if(['creating','resizing','exporting'].includes(job.stage)){await save(job,lease,{status:'blocked',error_code:'canva_creation_unknown'});return job;}
   let patch={next_poll_at:new Date(Date.now()+5000).toISOString(),error_code:null};
   if(!job.generation_id){await save(job,lease,{stage:'creating'});posting=true;const r=await client.request('/generations',{brief:brief(job.input),design_type:{type:'preset',name:'presentation'},outline:{sections:[{title:'故事視覺',description:'僅一頁精緻插畫背景，中央留白，無文字、無肖像。'}]}});if(!ID.test(r.job?.id||''))throw Error('canva_creation_unknown');patch={...patch,generation_id:r.job.id,stage:'generating'};}
   else if(!job.source_design_id){const r=await client.request('/generations/'+job.generation_id);if(r.job?.status==='failed')throw Error('canva_generation_failed');if(r.job?.status==='success'){if(!ID.test(r.job.result?.design?.id||''))throw Error('canva_invalid_export');patch={...patch,source_design_id:r.job.result.design.id,stage:'verify_source',next_poll_at:null};}}
   else if(job.stage==='verify_source'){const r=await client.request('/designs/'+job.source_design_id);if(r.design?.page_count!==1)throw Error('canva_single_page_required');patch={...patch,stage:'generated',next_poll_at:null};}
   else if(!job.resize_id){await save(job,lease,{stage:'resizing'});posting=true;const r=await client.request('/resizes',{design_id:job.source_design_id,design_type:{type:'custom',width:1080,height:1350}});if(!ID.test(r.job?.id||''))throw Error('canva_creation_unknown');patch={...patch,resize_id:r.job.id,stage:'resize'};}
   else if(!job.design_id){const r=await client.request('/resizes/'+job.resize_id);if(r.job?.status==='failed')throw Error('canva_generation_failed');if(r.job?.status==='success'){if(!ID.test(r.job.result?.design?.id||''))throw Error('canva_invalid_export');patch={...patch,design_id:r.job.result.design.id,stage:'design_ready',next_poll_at:null};}}
   else if(!job.export_id){await save(job,lease,{stage:'exporting'});posting=true;const r=await client.request('/exports',{design_id:job.design_id,format:{type:'jpg',quality:95,width:1080,height:1350,pages:[1]}});if(!ID.test(r.job?.id||''))throw Error('canva_creation_unknown');patch={...patch,export_id:r.job.id,stage:'export'};}
   else{const r=await client.request('/exports/'+job.export_id);if(r.job?.status==='failed')throw Error('canva_generation_failed');if(r.job?.status==='success'){if(r.job.urls?.length!==1)throw Error('canva_invalid_export');const bytes=await download(r.job.urls[0]),path=`${job.actor_id}/${job.story_id||'synthetic-canva-test'}/${job.id}-canva.jpg`,uploaded=await db.storage.from(BUCKET).upload(path,bytes,{contentType:'image/jpeg',upsert:true});if(uploaded.error)throw Error('canva_image_save_failed');patch={...patch,output_path:path,output_sha256:await digest(bytes),output_bytes:bytes.length,status:'ready',stage:'ready',next_poll_at:null};}}
   await save(job,lease,patch);return job;
  }catch(e){const code=e instanceof Error&&e.message.startsWith('canva_')?e.message:'canva_unavailable';if(['canva_connection_busy','canva_rate_limited','canva_unavailable','canva_image_save_failed'].includes(code)&&!posting){await save(job,lease,{next_poll_at:new Date(Date.now()+30000).toISOString(),error_code:code});return job;}await save(job,lease,{status:'blocked',error_code:posting&&code==='canva_unavailable'?'canva_creation_unknown':code});return job;
  }finally{await db.from(TABLE).update({lease:null,lease_until:null}).eq('id',job.id).eq('lease',lease);}
 }
 async function attach(row,job,actor){if(job.status!=='ready'||!job.output_path)return row;if(job.actor_id!==actor||job.story_id!==row.id)throw Error('forbidden');if((await latest(row.id))?.id!==job.id)throw Error('version_conflict');if(row.design_art?.job_id===job.id)return row;
  if(row.created_by!==actor||row.deleted_at||!['draft','changes_requested'].includes(row.status)||await canvaSnapshotHash(row)!==job.snapshot_hash)throw Error('cover_outdated');
  const art={...canvaSnapshot(row),path:job.output_path,job_id:job.id,sha256:job.output_sha256,bytes:job.output_bytes,type:'image/jpeg',provider:'canva',model:'Canva AI design generation',composition:'photo_frame',generated_at:new Date().toISOString()};
  const saved=await db.from('association_stories').update({design_art:art,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).eq('created_by',actor).in('status',['draft','changes_requested']).select('*').maybeSingle();if(saved.error||!saved.data)throw Error('version_conflict');return saved.data;
 }
 return {client,latest,start,advance,attach,download};
}
