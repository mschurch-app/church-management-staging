import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';
import {setStatus} from './app-ui.mjs?v=20261014-sermon2';
import {STEPS,emptyDraft,validateDraft,generationReady,applyGenerated,characterCount,videoUrl} from './sermon-preparation-contract.mjs?v=20261014-sermon2';

const $=s=>document.querySelector(s),ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/sermon-preparation';
const stepNames={information:'信息',materials:'素材',outline:'大綱',manuscript:'講章',slides:'投影片'};
const jobNames={media:'影片下載與轉錄',search:'搜尋素材',detail:'讀取素材',outline:'提出大綱',manuscript:'分段講章',slides:'逐頁內容',backup:'NAS 版本備份'};
const messages={forbidden:'尚未取得信息預備權限，需具備 M＋週報編輯權限及 LINE 綁定。',conflict:'已有較新的版本。你的輸入仍保留，請先下載或複製內容，再重新載入比對。',not_found:'找不到這份私人信息。',queue_limit:'目前排隊工作較多，請等已有工作完成後再試。',generation_limit:'已達今日生成上限，請先整理已有草稿。',materials_need_review:'請先逐份核對已選素材，再勾選確認。',outline_required:'請先保存並確認至少三個主要段落。',manuscript_too_short:'正文尚未達指定字數，請補充後再整理投影片。',invalid_draft:'請確認必填資料、字數及內容格式。',invalid_outline:'大綱每行一個段落，最多 12 段。',invalid_slides:'投影片最多 20 頁，請確認各頁標題。',invalid_materials:'素材格式不完整，請重新選取或補充自己的素材。'};
let project=null,draft=null,items=[],jobs=[],versions=[],busy=false,dirty=false,authorized=false,access=null,pollTimer=null,opening=0;
const processed=new Set(),pendingResults=new Set(),requestIds=new Map();
const el=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
const button=(text,fn,secondary=true)=>{const b=el('button',text,secondary?'secondary':'');b.type='button';b.disabled=busy;b.onclick=fn;return b;};
const message=(text,tone='neutral')=>setStatus($('#status'),text,{tone});
function markDirty(){dirty=true;$('#dirty-status').textContent='尚有未儲存的修改';$('#word-count').textContent=characterCount($('#manuscript').value).toLocaleString()+' 字';}
function mayLeave(){return !dirty||confirm('還有未儲存的修改。確定放棄本次修改並讀取其他內容？');}
function lock(value){busy=value;document.querySelectorAll('#content button,#draft-form input,#draft-form textarea,#draft-form select,#create-form input,#create-form button').forEach(b=>b.disabled=value);if(!value){$('#new-project').disabled=$('#empty-create').disabled=!canAction(access,'M+','website_weekly','create');$('#download-manuscript').disabled=$('#download-slides').disabled=!canAction(access,'M+','website_weekly','export');}}
async function api(action,input={}){
 const session=await db.auth.getSession(),token=session.data.session?.access_token;
 if(!token)throw Error('登入已失效，請重新登入教會 OS。');
 const mutation=['create','enqueue'].includes(action),key=action+JSON.stringify(input);
 if(mutation&&!requestIds.has(key))requestIds.set(key,crypto.randomUUID());
 const response=await fetch(ENDPOINT,{method:'POST',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({action,church:'M+',...input,...(mutation?{request_id:requestIds.get(key)}:{})})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(messages[result.error]||'連線暫時無法完成。輸入保留，請重新載入確認工作與版本後再試。');
 if(mutation)requestIds.delete(key);return result;
}
function drawProjects(){
 $('#projects').replaceChildren();
 if(!items.length)$('#projects').append(el('p','尚未建立信息。','muted'));
 for(const p of items){const b=button('',()=>openProject(p.id));b.className='studio-project-choice';b.setAttribute('aria-current',String(p.id===project?.id));b.append(el('strong',p.title),el('small',p.scripture+' · '+p.speaker),el('small','版本 '+p.version));$('#projects').append(b);}
}
function showStep(step,record=true){
 if(!STEPS.includes(step))return;
 document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==step);
 document.querySelectorAll('[data-step]').forEach(b=>{if(b.dataset.step===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 if(record&&draft&&draft.step!==step){draft.step=step;markDirty();}
}
function collect(){
 const next=structuredClone(draft);
 next.information={title:$('#edit-title').value.trim(),speaker:$('#edit-speaker').value.trim(),scripture:$('#edit-scripture').value.trim(),service_date:$('#edit-date').value};
 next.notes=$('#notes').value;next.audience=$('#audience').value;next.bible_version=$('#bible-version').value;next.target_characters=Number($('#target').value);
 next.outline=$('#outline').value.split('\n').map(x=>x.trim()).filter(Boolean);next.outline_confirmed=$('#outline-confirmed').checked;next.manuscript=$('#manuscript').value;
 return validateDraft(next);
}
function drawBackup(){
 $('#project-version').textContent='私人草稿 · 版本 '+project.version;
 $('#project-title').textContent=project.title;
 $('#backup-status').textContent=project.backup_version>=project.version?'此版本已回存 QNAP 與 Synology，內容指紋一致。':'教會 OS 已保存；此版本正在等待 NAS 備份回條。';
}
function drawEditor(){
 const info=draft.information;for(const [id,key] of [['edit-title','title'],['edit-speaker','speaker'],['edit-scripture','scripture'],['edit-date','service_date']])$('#'+id).value=info[key];
 $('#notes').value=draft.notes;$('#audience').value=draft.audience;$('#bible-version').value=draft.bible_version;$('#target').value=String(draft.target_characters);$('#outline').value=draft.outline.join('\n');$('#outline-confirmed').checked=draft.outline_confirmed;$('#manuscript').value=draft.manuscript;
 $('#word-count').textContent=characterCount(draft.manuscript).toLocaleString()+' 字';
 drawMaterials();drawSlides();drawChecklist();drawBackup();showStep(draft.step,false);
 $('#workspace').hidden=false;$('#empty-workspace').hidden=true;dirty=false;$('#dirty-status').textContent='已儲存';
 $('#versions').replaceChildren(...versions.map(v=>{const option=el('option','版本 '+v.version+' · '+new Date(v.created_at).toLocaleString('zh-TW'));option.value=String(v.version);return option;}));
 if(busy)lock(true);
}
function sourceLink(material){const a=el('a','回查原始來源 ↗');a.href=material.url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function drawMaterials(){
 $('#material-count').textContent='（'+draft.materials.length+'／24）';$('#materials').replaceChildren();
 for(const m of draft.materials){const card=el('article','','studio-material'),title=el('h4',m.title),meta=el('p',m.kind==='archive'?(m.speaker?'候選講員：'+m.speaker+' · ':'')+'參考段落，請核對上下文':m.kind==='transcript'?'影片轉錄 · 講員與範圍待確認':'自己提供的素材','source-meta');
 card.append(title,meta);if(m.url)card.append(sourceLink(m));
 const content=el('p',m.content);card.append(content);
 if(m.kind==='personal'){const editor=el('textarea');editor.value=m.content;editor.maxLength=6000;editor.rows=5;editor.setAttribute('aria-label','自己的素材內容');editor.oninput=()=>{m.content=editor.value;m.reviewed=false;card.querySelector('input[type=checkbox]').checked=false;markDirty();};card.append(editor);}
 const note=el('textarea');note.value=m.note;note.maxLength=3000;note.rows=3;note.placeholder='這份素材觸動我的是……';note.setAttribute('aria-label','素材領受與筆記');note.oninput=()=>{m.note=note.value;markDirty();};
 const label=el('label','','studio-check'),check=el('input');check.type='checkbox';check.checked=m.reviewed;check.onchange=()=>{m.reviewed=check.checked;markDirty();};label.append(check,el('span','已核對本次可使用的內容'));
 card.append(note,label,button('這次不用',()=>{draft.materials=draft.materials.filter(x=>x.id!==m.id);markDirty();drawMaterials();}));$('#materials').append(card);}
}
function drawSearch(result){
 $('#search-results').replaceChildren();
 for(const m of result.items||[]){const card=el('article','','studio-material');card.append(el('h4',m.title),el('p',m.content),el('p',(m.speaker?'候選講員：'+m.speaker+' · ':'')+'尚待核對','source-meta'),sourceLink(m));
 card.append(button(draft.materials.some(x=>x.id===m.id)?'已加入':'閱讀完整段落，加入預備',()=>queue('detail',{url:m.url,ordinal:m.ordinal,content_sha:m.content_sha})));$('#search-results').append(card);}
 if(!result.items?.length)$('#search-results').append(el('p','沒有找到符合文字，可換一個關鍵字，或加入自己的素材。','muted'));
}
function drawSlides(){
 $('#slides').replaceChildren();
 draft.slides.forEach((s,i)=>{const card=el('article','','studio-slide');card.append(el('small','第 '+(i+1)+' 頁'));for(const [key,label,max] of [['title','頁面標題',200],['content','畫面文字',2000],['notes','講員備註',5000]]){const input=el(key==='title'?'input':'textarea');input.value=s[key];input.maxLength=max;input.setAttribute('aria-label','第 '+(i+1)+' 頁'+label);input.oninput=()=>{s[key]=input.value;markDirty();};card.append(input);}$('#slides').append(card);});
}
function drawChecklist(){const root=$('#source-checklist');root.replaceChildren();if(draft.source_checklist.length){root.append(el('h4','來源與待查證清單'));const list=el('ul');draft.source_checklist.forEach(x=>list.append(el('li',x)));root.append(list);}}
function addMaterial(item){if(busy)return;if(draft.materials.length>=24){message('素材最多 24 份，請先整理已選內容。','error');return;}if(!draft.materials.some(m=>m.id===item.id)){draft.materials.push(structuredClone(item));markDirty();drawMaterials();}}
function processResults(){
 for(const j of jobs){if(j.status!=='completed'||processed.has(j.id)||!pendingResults.has(j.id))continue;processed.add(j.id);pendingResults.delete(j.id);
 if(j.kind==='search')drawSearch(j.result||{});
 if(j.kind==='detail'&&j.result?.item)addMaterial(j.result.item);
 }
}
function drawJobs(){
 const openJobs=new Set([...$('#jobs').querySelectorAll('[data-job-id] details[open]')].map(d=>d.closest('[data-job-id]').dataset.jobId));
 $('#jobs').replaceChildren();
 for(const j of jobs){const card=el('article','','studio-job');card.dataset.jobId=j.id;card.append(el('strong',jobNames[j.kind]||j.kind));
 card.append(el('p',j.status==='queued'?(j.progress||(j.kind==='media'?'等待台北時間 01:00–12:00 接續。':'已排入佇列，等待 Mini 接續。')):j.status==='running'?j.progress||'正在處理…':j.status==='failed'?j.error:'已完成',j.status==='failed'?'studio-job-error':'muted'));
 if(j.base_version&&['outline','manuscript','slides'].includes(j.kind))card.append(el('small','依版本 '+j.base_version+' 生成'));
 if(j.status==='completed'&&j.kind==='media'){const details=el('details');details.open=openJobs.has(j.id);details.append(el('summary','查看逐字稿 · 講員與範圍待確認'));for(const item of j.result?.items||[]){const part=el('article');part.append(el('small',Math.floor(item.start/60)+':'+String(Math.floor(item.start%60)).padStart(2,'0')+' — '+Math.floor(item.end/60)+':'+String(Math.floor(item.end%60)).padStart(2,'0')),el('p',item.content),button('加入此段素材',()=>{addMaterial(item);showStep('materials');}));details.append(part);}card.append(details);}
 if(j.status==='completed'&&j.kind==='search')card.append(button('查看搜尋結果',()=>{drawSearch(j.result||{});showStep('materials');}));
 if(j.status==='completed'&&j.kind==='detail'&&j.result?.item)card.append(button('將此段加入預備',()=>{addMaterial(j.result.item);showStep('materials');}));
 if(j.status==='completed'&&['outline','manuscript','slides'].includes(j.kind)){const details=el('details');details.open=openJobs.has(j.id);details.append(el('summary','閱讀草稿後再採用'));const text=j.kind==='outline'?j.result.outline?.join('\n\n'):j.kind==='manuscript'?j.result.manuscript:JSON.stringify(j.result.slides,null,2);details.append(el('pre',text||'結果格式不完整'));card.append(details,button('採用此草稿並儲存新版本',()=>adopt(j),false));}
 if(j.status==='failed'&&j.result?.completed_sections){const details=el('details');details.open=openJobs.has(j.id);details.append(el('summary','查看已完成段落'));details.append(el('pre',j.result.completed_sections.join('\n\n')));card.append(details,button('將已完成段落附加至講章草稿',()=>{if(busy)return;draft=collect();draft.manuscript+='\n\n'+j.result.completed_sections.join('\n\n');drawEditor();markDirty();showStep('manuscript');}));}
 $('#jobs').append(card);}
 if(!jobs.length)$('#jobs').append(el('p','目前沒有排隊工作。','muted'));
}
async function loadList(){
 const result=await api('list');items=result.items||[];drawProjects();const w=result.worker,c=w?.summary?.counts;
 $('#worker-status').textContent=w?.online?'Mini 已連線'+(c?' · 已收錄 '+Number(c.web_documents||0).toLocaleString()+' 個來源頁面／PDF':''):'Mini 尚未回報或暫時離線；可以繼續編輯保存，搜尋與生成會等連線恢復。';
}
async function openProject(id){
 if(busy||!mayLeave())return;lock(true);const seq=++opening;
 try{const result=await api('load',{project_id:id});if(seq!==opening)return;project=result.project;draft=validateDraft(result.payload);jobs=result.jobs||[];versions=result.versions||[];processed.clear();pendingResults.clear();jobs.filter(j=>['search','detail'].includes(j.kind)&&['queued','running'].includes(j.status)).forEach(j=>pendingResults.add(j.id));$('#search-results').replaceChildren();drawEditor();drawProjects();drawJobs();message('信息已載入；可返回任一步驟繼續預備。','success');history.replaceState(null,'','sermon-preparation.html?church=M%2B&project='+id);}
 catch(e){message(e.message,'error');}finally{lock(false);}
}
async function saveDraft(){
 if(!project)throw Error('請先建立信息。');const payload=collect();
 const result=await api('save',{project_id:project.id,base_version:project.version,payload});
 project=result.project;draft=result.payload;dirty=false;versions.unshift({version:project.version,created_at:project.updated_at});drawBackup();$('#dirty-status').textContent='已儲存';const row=items.find(x=>x.id===project.id);if(row)Object.assign(row,project);drawProjects();
 $('#versions').replaceChildren(...versions.map(v=>{const option=el('option','版本 '+v.version);option.value=v.version;return option;}));
 return result;
}
async function save(){if(busy)return;lock(true);try{await saveDraft();message('新版本已儲存。NAS 備份會另行顯示回條。','success');}catch(e){message(e.message,'error');}finally{lock(false);}}
async function queue(kind,options={}){
 if(busy||!project)return;lock(true);
 try{draft=collect();if(dirty)await saveDraft();generationReady(draft,kind);
 const result=await api('enqueue',{project_id:project.id,base_version:project.version,kind,options});if(['search','detail'].includes(kind))pendingResults.add(result.job.id);jobs.unshift(result.job);drawJobs();message(jobNames[kind]+'已排入佇列；可繼續閱讀或稍後回來查看。','success');}
 catch(e){message(messages[e.message]||e.message,'error');}finally{lock(false);}
}
async function adopt(job){
 if(busy)return;lock(true);try{
  if(dirty)await saveDraft();if(job.base_version&&job.base_version!==project.version&&!confirm('此草稿依版本 '+job.base_version+' 生成，目前是版本 '+project.version+'。確定採用並更新對應內容？'))return;draft=applyGenerated(collect(),job.kind,job.result);drawEditor();markDirty();await saveDraft();drawEditor();message('草稿已採用並保存新版本，請繼續人工核對。','success');
 }catch(e){message(messages[e.message]||e.message,'error');}finally{lock(false);}
}
async function poll(){
 if(!authorized)return;
 try{if(!document.hidden&&!busy){await loadList();if(project){const result=await api('load',{project_id:project.id});if(result.project.version!==project.version)message('這份信息在另一個視窗有新版本。你的輸入保留，請先保存副本再重新載入比對。','error');project.backup_version=result.project.backup_version;const nextJobs=result.jobs||[],changed=JSON.stringify(nextJobs)!==JSON.stringify(jobs);jobs=nextJobs;drawBackup();processResults();if(changed)drawJobs();}}}catch{/* Keep user edits and last known job state. */}
 finally{pollTimer=setTimeout(poll,jobs.some(j=>['queued','running'].includes(j.status))?8000:30000);}
}
function download(kind){
 if(!project||!canAction(access,'M+','website_weekly','export'))return;
 try{const data=collect();const text=kind==='manuscript'?'# '+data.information.title+'\n\n'+data.information.scripture+' · '+data.information.speaker+'\n\n'+data.manuscript+'\n\n## 來源與待查證\n'+data.source_checklist.join('\n'):JSON.stringify({title:data.information.title,scripture:data.information.scripture,slides:data.slides},null,2);
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=el('a');a.href=url;a.download=data.information.title.replace(/[\\/:*?"<>|]/g,'_')+(kind==='slides'?'-逐頁內容.json':'-講章.md');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已準備下載，請確認瀏覽器的下載紀錄。');}catch(e){message(messages[e.message]||e.message,'error');}
}
function openCreate(){if(busy||!mayLeave())return;$('#create-status').textContent='';$('#create-dialog').showModal();$('#new-title').focus();}
async function create(event){
 event.preventDefault();if(busy)return;lock(true);
 try{const values={title:$('#new-title').value.trim(),scripture:$('#new-scripture').value.trim(),speaker:$('#new-speaker').value.trim(),service_date:$('#new-date').value};const result=await api('create',values);$('#create-dialog').close();dirty=false;lock(false);await loadList();await openProject(result.project.id);}
 catch(e){$('#create-status').textContent=e.message;}finally{lock(false);}
}
async function start(){
 try{const church=new URLSearchParams(location.search).get('church')||'M+';if(church!=='M+')throw Error('信息預備目前提供 M＋同工使用，請切換 M＋。');const session=await db.auth.getSession();if(!session.data.session?.access_token){location.replace('admin-login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
 access=await readAccess(db);if(!canOpen(access,'M+','website_weekly')||!canAction(access,'M+','website_weekly','edit'))throw Error(messages.forbidden);
 authorized=true;$('#content').hidden=false;if(matchMedia('(max-width:850px)').matches)$('#project-drawer').open=false;await loadList();lock(false);
 const requested=new URLSearchParams(location.search).get('project');if(requested&&items.some(p=>p.id===requested))await openProject(requested);else message('選一篇信息繼續預備，或建立新的信息。','success');pollTimer=setTimeout(poll,8000);
 }catch(e){message(e.message,'error');}
}
$('#draft-form').addEventListener('submit',e=>e.preventDefault());$('#draft-form').addEventListener('input',event=>{if(event.target.id==='outline')$('#outline-confirmed').checked=false;markDirty();});
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>showStep(b.dataset.step));
$('#save').onclick=save;$('#new-project').onclick=$('#empty-create').onclick=openCreate;$('#close-create').onclick=()=>{if(!busy)$('#create-dialog').close();};$('#create-form').onsubmit=create;
$('#reload').onclick=async()=>{if(busy||!mayLeave())return;dirty=false;try{await loadList();if(project)await openProject(project.id);}catch(e){message(e.message,'error');}};
$('#queue-video').onclick=()=>{try{void queue('media',{url:videoUrl($('#video-url').value.trim())});}catch{message('請貼上有效的 YouTube 單支影片 HTTPS 網址。','error');}};
$('#search').onclick=()=>queue('search',{query:$('#query').value.trim()});$('#query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void queue('search',{query:$('#query').value.trim()});}};
$('#personal-material').onclick=()=>{if(draft.materials.length>=24)return message('素材最多 24 份，請先整理已選內容。','error');draft.materials.push({kind:'personal',id:crypto.randomUUID(),title:'自己的素材',speaker:project.speaker,content:'',note:'',reviewed:false});drawMaterials();markDirty();};
for(const kind of ['outline','manuscript','slides'])$('#generate-'+kind).onclick=()=>queue(kind);
$('#download-manuscript').onclick=()=>download('manuscript');$('#download-slides').onclick=()=>download('slides');
$('#restore-version').onclick=async()=>{if(busy||!mayLeave())return;lock(true);try{const result=await api('version',{project_id:project.id,version:Number($('#versions').value)});draft=validateDraft(result.payload);drawEditor();markDirty();message('舊版已讀入作為草稿；儲存後會建立新版本，原版本保留。');}catch(e){message(e.message,'error');}finally{lock(false);}};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>clearTimeout(pollTimer));start();

