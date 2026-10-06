import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const TZ='Asia/Taipei', CHANNEL_ID='UClE8pjK0fnA-o18VxblIm6A', APP='https://mscos.mchurch.online';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function dateTW(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function text(x:string){return x.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
async function latestVideo(){
 const response=await fetch('https://www.youtube.com/feeds/videos.xml?channel_id='+CHANNEL_ID,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'MPlusChurchOS/1.0'}});
 if(!response.ok)throw new Error('youtube_feed_'+response.status);
 const xml=await response.text(), entries=[...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(x=>x[1]);
 for(const entry of entries){
  const id=entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]||'';
  const title=text(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]||'');
  const published=entry.match(/<published>([^<]+)<\/published>/)?.[1]?.slice(0,10)||'';
  if(id&&published===dateTW())return {id,title,published,url:'https://www.youtube.com/watch?v='+id};
 }
 throw new Error('today_video_not_ready');
}
async function gemini(key:string,model:string,parts:any[],maxOutputTokens=8000){
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
  method:'POST',signal:AbortSignal.timeout(240000),headers:{'x-goog-api-key':key,'content-type':'application/json'},
  body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0.1,maxOutputTokens,responseMimeType:'application/json'}})
 });
 const raw=await response.text();if(!response.ok)throw new Error('gemini_http_'+response.status+':'+raw.slice(0,300));
 const data=JSON.parse(raw),value=String(data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'').trim();
 if(!value)throw new Error('gemini_empty');return JSON.parse(value);
}
function splitCaptionText(value:string,max=30){const clean=String(value||'').replace(/\s+/g,' ').trim(),units=clean.match(/[^，。！？；：、,.!?;:]+[，。！？；：、,.!?;:]?/g)||[clean],out:string[]=[];let current='';for(const unit of units){for(let rest=unit;rest;){const room=max-[...current].length;if(room<=0){out.push(current);current='';continue}const chars=[...rest],take=chars.slice(0,room).join('');current+=take;rest=chars.slice(room).join('');if(rest||[...current].length>=max){out.push(current);current=''}}}if(current)out.push(current);return out.filter(Boolean)}
function compactCues(cues:any[]){return cues.flatMap((cue:any)=>{const start=Number(cue.start_seconds),end=Number(cue.end_seconds),parts=splitCaptionText(String(cue.text||''));if(!parts.length||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return[];const total=parts.reduce((sum,text)=>sum+[...text].length,0);let cursor=start,used=0;return parts.map((text,i)=>{used+=[...text].length;const next=i===parts.length-1?end:start+(end-start)*(used/total),result={start_seconds:Number(cursor.toFixed(3)),end_seconds:Number(next.toFixed(3)),text};cursor=next;return result})})}
async function analyzeSegment(video:{id:string;title:string;published:string;url:string},start:number,end:number){
 const key=Deno.env.get('GEMINI_API_KEY')||'';if(!key)throw new Error('gemini_key_missing');
 const model='gemini-3.1-flash-lite';
 const prompt=`分析這段主日直播（全片第 ${start} 到 ${end} 秒），一次建立後續所有發布內容共用的講道主稿。辨識內容類型，排除敬拜詩歌、樂器演奏、主持、奉獻、報告、活動宣傳與片尾。若包含正式講道，整理該段講道的大綱候選與重點，並只針對講道產生繁體中文字幕。字幕須忠於講員原意、修正常見同音錯字與標點，每則約 5 至 12 秒、自然斷句、最多30個中文字，確保播放器顯示不超過兩行；時間使用全片秒數。輸出 JSON：segment_start、segment_end、content_types（陣列）、contains_sermon（布林）、sermon_start_seconds、sermon_end_seconds、speaker、scripture、summary、outline_candidates（陣列）、key_points（陣列）、subtitle_cues（陣列，每項包含 start_seconds、end_seconds、text）。`;
 const result=await gemini(key,model,[{fileData:{fileUri:video.url,mimeType:'video/mp4'},videoMetadata:{startOffset:start+'s',endOffset:end+'s',fps:0.1}},{text:prompt}],8000);
 return {model,result};
}
async function synthesize(video:{id:string;title:string;published:string;url:string},segments:any[]){
 const key=Deno.env.get('GEMINI_API_KEY')||'';if(!key)throw new Error('gemini_key_missing');
 const model='gemini-3.1-flash-lite',usable=segments.map(x=>{const analysis=x.analysis||{},copy={...analysis};delete copy.subtitle_cues;return copy}).filter(x=>x?.contains_sermon);
 if(!usable.length)throw new Error('sermon_segment_not_found');
 const prompt=`以下是同一場主日直播分段分析後，只包含正式講道的主稿資料。請合併並去除重複。所有內容必須以主稿為唯一依據，嚴禁無中生有；不得補寫講員沒有說過的故事、例證、經文解釋、神學主張、結論或應用。敬拜、報告、奉獻與主持內容一律排除。
影片標題：${video.title}
日期：${video.published}
分段資料：${JSON.stringify(usable)}
可以為原有內容下精簡標題、彙整重點、整理講員已表達的結論，以及把講員提出的行動方向整理為應用回應，但不得擴張或改變原意。若資料不足，寧可少寫或留空，不可推測。IG 貼文依序呈現講題與經文、講道重點、結論、應用回應及聚會邀請；聚會邀請只使用教會既有固定資訊，不假裝是講員原話。不得輸出逐字稿或星號字元。
請輸出 JSON：sermon_title、speaker、scripture、sermon_start_seconds、sermon_end_seconds、confidence（high/medium/low）、outline（4至7項，每項包含標題與精簡說明）、key_points（3至6項，每項為可直接閱讀的重點內容）、applications（2至4項）、caption（不超過1800字）。欄位為 sermon_title、speaker、scripture、sermon_start_seconds、sermon_end_seconds、confidence、outline、key_points、applications、caption。`;
 return {model,result:await gemini(key,model,[{text:prompt}],12000)};
}
async function notifyInitialReviewer(db:any,draft:any){
 if(!Array.isArray(draft.social_image_options)||draft.social_image_options.length!==3)return 0;
 const initial=await db.from('pastoral_staff').select('id,display_name').eq('id','d066ac92-9801-46cc-9293-2932399b4e11').eq('is_active',true).maybeSingle();
 if(!initial.data)return 0;
 const person=initial.data,key='sermon-social-review:'+draft.id+':'+person.id,url='/sermon-social-review.html?draft='+draft.id;
 await db.from('pastoral_tasks').upsert({entity_key:'mplus',title:'初審 '+draft.service_date+' 講道 IG 內容',description:'請核對整理後的大綱、重點與貼文內容，並從 1080p 原始影片截取的兩張膝蓋以上、一張半身講員圖中選擇一張；初審通過後才送牧師、師母確認發出。',task_type:'document',status:'pending',assigned_to:person.id,idempotency_key:key,payload:{workflow:'sermon_social_initial_review',draft_id:draft.id,review_stage:'initial_review',action_url:url,required_image_selection:true,required_image_count:3,required_image_shots:['knees_up','knees_up','half_body'],image_source:'youtube_1080p_frame',image_template:'mplus_sermon_card_v1',composition_labels_embedded:false}},{onConflict:'idempotency_key',ignoreDuplicates:true});
 const queued=await db.from('sermon_social_notification_queue').upsert({draft_id:draft.id,staff_id:person.id,stage:'initial_review',source_key:key,title:'講道 IG 內容等待初審',body:draft.service_date+'｜'+draft.sermon_title,target_url:url,deliver_after:new Date(Date.now()+3*60*1000).toISOString(),status:'pending',attempt_count:0,error_code:null,sent_at:null,updated_at:new Date().toISOString()},{onConflict:'source_key'});if(queued.error)throw new Error('notification_queue_failed');
 return 1;
}
Deno.serve(async req=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 const secret=req.headers.get('x-cron-secret')||'';if(!url||!key||!secret)return json(401,{ok:false,error:'unauthorized'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const valid=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});if(valid.error||valid.data!==true)return json(401,{ok:false,error:'unauthorized'});
 const automation=await db.from('media_publishing_settings').select('sermon_analysis_enabled').eq('church_id','M+').maybeSingle();
 if(automation.error)return json(503,{ok:false,error:'publishing_settings_unavailable'});
 if(automation.data?.sermon_analysis_enabled!==true)return json(200,{ok:true,status:'skipped',reason:'sermon_analysis_disabled'});
 let video:any;
 try{
  const body=await req.json().catch(()=>({}));video=body.video_id?{id:String(body.video_id),title:String(body.title||''),published:String(body.service_date||dateTW()),url:'https://www.youtube.com/watch?v='+String(body.video_id)}:await latestVideo();
  const prior=await db.from('sermon_social_drafts').select('id,status,updated_at').eq('church_id','M+').eq('youtube_video_id',video.id).maybeSingle();
  const freshProcessing=prior.data?.status==='processing'&&Date.now()-new Date(prior.data.updated_at).getTime()<10*60*1000,isSegment=Number.isInteger(Number(body.segment_index)),forceFinalize=body.finalize===true;
  if(!isSegment&&!forceFinalize&&((prior.data&&prior.data.status!=='failed'&&prior.data.status!=='processing')||freshProcessing))return json(200,{ok:true,duplicate:true,draft_id:prior.data.id,status:prior.data.status});
  const bulletin=await db.from('website_weekly_bulletins').select('hero_image_path').eq('church_id','M+').eq('service_date',video.published).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  const started=await db.from('sermon_social_drafts').upsert({church_id:'M+',service_date:video.published,youtube_video_id:video.id,youtube_url:video.url,sermon_title:video.title,source_image_path:bulletin.data?.hero_image_path||null,status:'processing',review_stage:'initial_review',initial_reviewer_id:'d066ac92-9801-46cc-9293-2932399b4e11',updated_at:new Date().toISOString()},{onConflict:'church_id,youtube_video_id'}).select('id').single();
  if(started.error)throw new Error('draft_store');
  const ranges=Array.from({length:30},(_,i)=>[i*300,(i+1)*300]),segmentIndex=Number(body.segment_index),durationSeconds=Number(body.duration_seconds),requiredSegments=Number.isFinite(durationSeconds)&&durationSeconds>0?Math.ceil(durationSeconds/300):ranges.length;
  if(Number.isInteger(segmentIndex)&&segmentIndex>=0&&segmentIndex<ranges.length){
   const [segmentStart,segmentEnd]=ranges[segmentIndex];
   await db.from('sermon_social_segments').upsert({draft_id:started.data.id,segment_index:segmentIndex,start_seconds:segmentStart,end_seconds:segmentEnd,status:'processing',error_code:null,updated_at:new Date().toISOString()},{onConflict:'draft_id,segment_index'});
   if(Number.isFinite(durationSeconds)&&durationSeconds>0&&segmentStart>=durationSeconds){
    await db.from('sermon_social_segments').update({status:'completed',analysis:{content_types:['out_of_range'],contains_sermon:false,segment_start:segmentStart,segment_end:segmentEnd,summary:'超出影片片長，略過。',outline_candidates:[],key_points:[]},error_code:null,updated_at:new Date().toISOString()}).eq('draft_id',started.data.id).eq('segment_index',segmentIndex);
    await db.from('sermon_subtitle_segments').upsert({draft_id:started.data.id,segment_index:segmentIndex,start_seconds:segmentStart,end_seconds:segmentEnd,cues:[],status:'completed',error_code:null,model:'gemini-3.1-flash-lite',reviewed_cues:[],review_status:'completed',review_error:null,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'draft_id,segment_index'});
    return json(200,{ok:true,status:'segment_skipped',draft_id:started.data.id,segment_index:segmentIndex});
   }
   try{const segment=await analyzeSegment(video,segmentStart,segmentEnd),rawCues=Array.isArray(segment.result?.subtitle_cues)?segment.result.subtitle_cues:[],cues=compactCues(rawCues.map((cue:any)=>({start_seconds:Number(cue?.start_seconds),end_seconds:Number(cue?.end_seconds),text:String(cue?.text||'').trim()}))).filter((cue:any)=>Number.isFinite(cue.start_seconds)&&Number.isFinite(cue.end_seconds)&&cue.start_seconds>=segmentStart&&cue.end_seconds>cue.start_seconds&&cue.end_seconds<=segmentEnd&&cue.text);await db.from('sermon_social_segments').update({status:'completed',analysis:segment.result,error_code:null,updated_at:new Date().toISOString()}).eq('draft_id',started.data.id).eq('segment_index',segmentIndex);const subtitle=await db.from('sermon_subtitle_segments').upsert({draft_id:started.data.id,segment_index:segmentIndex,start_seconds:segmentStart,end_seconds:segmentEnd,cues,status:'completed',error_code:null,model:segment.model,reviewed_cues:[],review_status:cues.length?'pending':'completed',review_error:null,reviewed_at:cues.length?null:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'draft_id,segment_index'});if(subtitle.error)throw new Error('subtitle_store');return json(200,{ok:true,status:'segment_completed',draft_id:started.data.id,segment_index:segmentIndex,subtitle_cues:cues.length});}
   catch(error){const message=error instanceof Error?error.message:'segment_error';await db.from('sermon_social_segments').update({status:'failed',error_code:message.slice(0,500),updated_at:new Date().toISOString()}).eq('draft_id',started.data.id).eq('segment_index',segmentIndex);return json(503,{ok:false,error:message,segment_index:segmentIndex});}
  }
  const segments=await db.from('sermon_social_segments').select('segment_index,status,analysis,error_code').eq('draft_id',started.data.id).order('segment_index');
  if(segments.error)throw new Error('segment_query_failed');
  const completed=(segments.data||[]).filter((x:any)=>x.status==='completed');
  if(completed.length<requiredSegments)return json(202,{ok:true,status:'awaiting_segments',draft_id:started.data.id,completed:completed.length,total:requiredSegments});
  const output=await synthesize(video,completed),r=output.result;
  const saved=await db.from('sermon_social_drafts').update({sermon_title:String(r.sermon_title||video.title),speaker:String(r.speaker||''),scripture:String(r.scripture||''),sermon_start_seconds:Number(r.sermon_start_seconds)||null,sermon_end_seconds:Number(r.sermon_end_seconds)||null,transcript:null,outline:Array.isArray(r.outline)?r.outline:[],key_points:Array.isArray(r.key_points)?r.key_points:[],applications:Array.isArray(r.applications)?r.applications:[],caption:String(r.caption||'').replace(/\*/g,''),status:'pending_review',review_stage:'initial_review',initial_reviewer_id:'d066ac92-9801-46cc-9293-2932399b4e11',model:output.model,error_code:null,updated_at:new Date().toISOString()}).eq('id',started.data.id).select('*').single();
  if(saved.error)throw new Error('draft_update');
  const recipients=await notifyInitialReviewer(db,saved.data);return json(200,{ok:true,draft_id:saved.data.id,status:'pending_review',recipients,instagram_review_independent_of_subtitles:true,video});
 }catch(error){
  const message=error instanceof Error?error.message:'unknown';
  if(video?.id)await db.from('sermon_social_drafts').update({status:'failed',error_code:message.slice(0,500),updated_at:new Date().toISOString()}).eq('church_id','M+').eq('youtube_video_id',video.id);
  return json(503,{ok:false,error:message});
 }
});
