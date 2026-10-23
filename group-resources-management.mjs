import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {operationsWorkflow} from './operations-workflow.mjs?v=20261023-operations1';
const $=s=>document.querySelector(s),church='M+',labels={draft:'草稿',published:'公開',archived:'封存但公開'};
let rows=[],user,current=null,newId=null;
const flow=operationsWorkflow({db,editor:$('#editor'),status:$('#status'),read:async()=>{
 const access=await readAccess(db);if(!canOpen(access,church,'website_group_resources'))throw Error('沒有網站內容管理權限。');user=access.user;
 const {data,error}=await db.from('website_content_posts').select('*').eq('church_id',church).eq('content_type','group_resource').order('published_on',{ascending:false});if(error)throw error;return data||[];
},apply:data=>{rows=data;render();},clear:()=>{rows=[];$('#items').replaceChildren();$('#count').textContent='';},close:()=>{$('#editor').hidden=true;$('#form').reset();current=null;newId=null;}});
function edit(row=null){
 if(!flow.ready||!flow.canLeave())return;current=row;newId=row?null:crypto.randomUUID();$('#editor').hidden=false;
 for(const [id,key] of Object.entries({id:'id',date:'published_on',title:'title',excerpt:'excerpt',content:'content_html',image:'hero_image_url'}))$('#'+id).value=row?.[key]||'';
 $('#state').value=row?.status||'draft';$('#form-title').textContent=row?'編輯教材':'新增教材';$('#form-mode').textContent=row?'正在編輯':'尚未儲存';$('#save').textContent=row?'儲存修改':'儲存新教材';$('#delete').disabled=!row;
 flow.open($('#form'));render();$('#editor').scrollIntoView({behavior:'smooth',block:'start'});$('#date').focus();
}
function render(){
 const term=$('#search').value.trim().toLocaleLowerCase(),state=$('#filter-state').value,visible=rows.filter(row=>(state==='all'||row.status===state)&&(!term||[row.title,row.published_on,row.excerpt].some(v=>String(v||'').toLocaleLowerCase().includes(term))));
 $('#count').textContent=`顯示 ${visible.length}／${rows.length} 份教材。`;const area=$('#items');area.replaceChildren();
 for(const row of visible){const button=document.createElement('button'),heading=document.createElement('strong'),meta=document.createElement('small');button.type='button';button.dataset.appControl='surface';button.setAttribute('aria-pressed',String(row.id===current?.id));button.className='item'+(row.id===current?.id?' active':'');heading.textContent=row.title;meta.textContent=(row.published_on||'未填日期')+' · '+(labels[row.status]||row.status);button.append(meta,heading);button.onclick=()=>edit(row);area.append(button);}
 if(!visible.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='目前沒有符合條件的教材。';area.append(empty);}
}
async function acknowledged(query){const {data,error}=await query.select('id');if(error)throw error;if(!Array.isArray(data)||data.length!==1){const error=Error('未能確認教材異動，請重新載入確認。');error.name='InvalidResponseError';throw error;}}
function scoped(query,id){return query.eq('id',id).eq('church_id',church).eq('content_type','group_resource');}
$('#form').onsubmit=event=>{
 event.preventDefault();if(!flow.ready||flow.busy)return;
 const now=new Date().toISOString(),payload={church_id:church,content_type:'group_resource',source_key:current?.source_key||newId,title:$('#title').value.trim(),published_on:$('#date').value,excerpt:$('#excerpt').value.trim(),content_html:$('#content').value.trim(),hero_image_url:$('#image').value.trim(),status:$('#state').value,updated_by:user.id,updated_at:now,published_at:$('#state').value==='draft'?null:now};
 if(!payload.title||!payload.content_html){flow.message('請填寫標題與完整內文。');return;}if(!current)payload.created_by=user.id;
 const row=current;
 flow.write(()=>acknowledged(row?scoped(db.from('website_content_posts').update(payload),row.id):db.from('website_content_posts').insert(payload)),`「${payload.title}」已儲存。`);
};
$('#delete').onclick=()=>{if(!current||!flow.ready||!flow.canLeave()||!confirm('確定刪除此教材？網站上也會移除。'))return;const id=current.id;flow.write(()=>acknowledged(scoped(db.from('website_content_posts').delete(),id)),'教材已刪除。');};
$('#new').onclick=()=>edit();$('#cancel').onclick=()=>flow.close();$('#search').oninput=render;$('#filter-state').onchange=render;$('#reload').onclick=flow.load;
flow.load();
