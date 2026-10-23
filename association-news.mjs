import {contentWorkflow} from './content-workflow.mjs?v=20261023-content1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261022-experience5';

const $=selector=>document.querySelector(selector);
const BUCKET='church-website-public-media';
const MAX_FILES=5,MAX_BYTES=8*1024*1024;
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
let access=null,user=null,rows=[],objectUrls=[];
function status(message,tone=''){flow.message(message);$('#status').dataset.tone=tone;}
function clearPreview(){for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[];$('#photo-preview').replaceChildren();}
function validateFiles(files){if(files.length>MAX_FILES)throw Error('最多選 5 張照片。');for(const file of files){if(!IMAGE_TYPES.has(file.type))throw Error('照片僅接受 JPG、PNG 或 WebP。');if(file.size>MAX_BYTES)throw Error('每張照片不得超過 8 MB。');}}
$('#photos').addEventListener('change',()=>{clearPreview();try{const files=[...$('#photos').files];validateFiles(files);for(const file of files){const url=URL.createObjectURL(file),image=document.createElement('img');objectUrls.push(url);image.src=url;image.alt=file.name;$('#photo-preview').append(image);}status(files.length?`已選擇 ${files.length} 張照片。`:'請填寫主題與內容。');}catch(error){$('#photos').value='';status(error.message,'error');}});
function render(){const list=$('#items');list.replaceChildren();const term=$('#search').value.trim().toLocaleLowerCase('zh-Hant'),matches=rows.filter(row=>!term||row.title.toLocaleLowerCase('zh-Hant').includes(term));$('#result-count').textContent=`顯示 ${matches.length} / ${rows.length} 則；最多最近 20 則已發布消息。`;if(!matches.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=rows.length?'沒有符合搜尋的消息。':'還沒有最新消息。';list.append(empty);return;}for(const row of matches){const item=document.createElement('div');item.className='news-item';if(row.hero_image_url){const img=document.createElement('img');img.src=row.hero_image_url;img.alt='';item.append(img);}const text=document.createElement('span');const title=document.createElement('strong');title.textContent=row.title;const date=document.createElement('small');date.textContent=new Date(row.published_at).toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Taipei'});text.append(title,date);item.append(text);list.append(item);}}
async function read(){const current=await readAccess(db);if(!canOpen(current,'M+','website_group_resources'))throw Error('目前帳號沒有協會網站內容權限。');const {data,error}=await db.from('association_news').select('id,title,hero_image_url,published_at').eq('status','published').order('published_at',{ascending:false}).limit(20);if(error)throw error;return {access:current,rows:data||[]};}
async function uploadImages(files){const urls=[];for(let i=0;i<files.length;i++){if(!flow.ready)throw Error('登入狀態已變更。');const file=files[i],ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';status(`正在上傳照片 ${i+1}/${files.length}…`);const path=`association-news/${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});if(error)throw Error(`照片上傳失敗：${error.message}`);const result=db.storage.from(BUCKET).getPublicUrl(path);urls.push(result.data.publicUrl);}return urls;}
const flow=contentWorkflow({db,read,apply:result=>{access=result.access;user=access.user;rows=result.rows;render();},clear:()=>{access=null;user=null;rows=[];$('#items').replaceChildren();$('#result-count').textContent='尚未載入消息。';},reset:()=>{HTMLFormElement.prototype.reset.call($('#form'));clearPreview();},sync:ready=>{$('#publish').disabled=!ready||!access||!canAction(access,'M+','website_group_resources','create');}});
flow.track($('#form'));
$('#form').addEventListener('submit',async event=>{
 event.preventDefault();if(flow.busy||!flow.ready)return;
 if(!access||!canAction(access,'M+','website_group_resources','create'))return status('目前帳號沒有協會網站上稿權限。','error');
 const title=$('#title').value.trim(),body=$('#body').value.trim(),summary=$('#summary').value.trim(),files=[...$('#photos').files];
 if(!title||!body)return status('請填寫主題及文字內容。','error');try{validateFiles(files);}catch(error){return status(error.message,'error');}
 const author=user.id;
 await flow.write(async()=>{const imageUrls=await uploadImages(files);if(!flow.ready)throw Error('登入狀態已變更。');const payload={source_key:crypto.randomUUID(),title,summary,body,hero_image_url:imageUrls[0]||'',image_urls:imageUrls,status:'published',published_at:new Date().toISOString(),created_by:author,updated_by:author};const {data,error}=await db.from('association_news').insert(payload).select('id');if(error)throw error;if(!Array.isArray(data)||data.length!==1){const error=new Error('尚無法確認發布結果。');error.name='InvalidResponseError';throw error;}},`「${title}」已發佈。`);
});
for(const id of ['#reset','#new'])$(id).addEventListener('click',()=>{if(!flow.canLeave())return;flow.discard();status('已開啟空白表單。');$('#title').focus();});
$('#search').oninput=render;$('#reload').onclick=()=>flow.load();flow.load();
