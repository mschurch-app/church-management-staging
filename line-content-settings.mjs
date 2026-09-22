import {db} from './admin-db.mjs';
import {listTodaysMessages,listLoveShareCards,saveSpiritualCard,saveGreeting,setContentActive,uploadGreetingImage,greetingPreview} from './pastoral-content-management.mjs';

const $=selector=>document.querySelector(selector);
const values=new URLSearchParams(location.search).getAll('church');
const church=values.length===1?values[0]:null;
const mode=document.body.dataset.library;
const PAGE_SIZE=24;
let rows=[],page=1,busy=false;

function element(tag,text='',className=''){const node=document.createElement(tag);node.textContent=text;node.className=className;return node;}
function control(type,value=''){const node=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')node.type=type;node.value=value??'';return node;}
function field(label,node,full=false,hint=''){const wrapper=element('label','',full?'full-width':'');wrapper.append(document.createTextNode(label),node);if(hint)wrapper.append(element('small',hint,'field-hint'));return wrapper;}
function churchName(){return church==='M+'?'M＋大雅教會':'火樂教會';}
function closeEditor(){const editor=$('#editor');editor.hidden=true;editor.replaceChildren();}
function setBusy(form,value){busy=value;form?.querySelectorAll('button,input,textarea,select').forEach(node=>node.disabled=value);}
function normalize(text){return String(text||'').toLocaleLowerCase('zh-Hant');}

async function imageSource(path){if(/^https:\/\//i.test(path||''))return path;return greetingPreview(db,path);}
async function attachImage(img,path){try{img.src=await imageSource(path);}catch{img.alt='圖片目前無法預覽';img.classList.add('image-unavailable');}}

function openForm(row=null){
  const editor=$('#editor'),form=document.createElement('form'),grid=element('div','','edit-grid'),actions=element('div','','editor-actions');
  editor.replaceChildren();editor.hidden=false;
  if(mode==='today'){
    const reference=control('text',row?.scripture_ref||''),scripture=control('textarea',row?.scripture||''),prayer=control('textarea',row?.prayer_text||'');
    reference.required=scripture.required=prayer.required=true;
    reference.placeholder='例如：詩篇 23:1';scripture.placeholder='輸入完整經文';prayer.placeholder='輸入要隨經文顯示的牧者祝福';
    const purpose=control('text','給今天的你');purpose.disabled=true;grid.append(field('經文出處',reference),field('內容用途',purpose),field('經文內容',scripture,true),field('牧者祝福',prayer,true));
    form.onsubmit=event=>submit(event,form,()=>saveSpiritualCard(db,church,{category:'給今天的你',scripture_ref:reference.value,scripture:scripture.value,prayer_text:prayer.value},row));
  }else{
    const category=control('text',row?.category||''),title=control('text',row?.title||''),caption=control('textarea',row?.share_caption||''),file=control('file');
    category.required=title.required=caption.required=true;file.accept='image/jpeg,image/png,image/webp';if(!row)file.required=true;
    category.placeholder='例如：低潮陪伴、家人問候';title.placeholder='圖卡顯示標題';caption.placeholder='輸入經文、出處與祝福文字';
    grid.append(field('祝福情境',category),field('圖卡標題',title),field('經文／祝福內容',caption,true,'此內容會隨圖卡一起分享。'),field(row?'更換照片（選填）':'照片',file,true,'JPG、PNG 或 WebP，檔案大小 5MB 以內。'));
    form.onsubmit=event=>submit(event,form,async()=>{let path=row?.image_url||'';if(file.files[0])path=await uploadGreetingImage(db,church,file.files[0]);return saveGreeting(db,church,{category:category.value,title:title.value,share_caption:caption.value,image_url:path},row);});
  }
  const cancel=element('button','取消','secondary'),save=element('button','儲存');cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.prepend(element('h2',row?'編輯內容':mode==='today'?'新增經文':'新增祝福圖卡'));form.append(grid,actions);editor.append(form);editor.scrollIntoView({behavior:'smooth',block:'start'});form.querySelector('input,textarea')?.focus();
}

async function submit(event,form,save){event.preventDefault();if(busy)return;setBusy(form,true);try{await save();closeEditor();await load();$('#status').textContent='內容已儲存，LINE 內容庫已同步更新。';}catch(error){$('#status').textContent=error.message;setBusy(form,false);}}
async function changeState(row,active){if(busy||!confirm((active?'恢復':'停用')+'這筆內容？資料會保留。'))return;busy=true;try{await setContentActive(db,church,mode==='today'?'spiritual_cards':'share_greeting_cards',row,active);await load();$('#status').textContent=active?'內容已恢復。':'內容已停用。';}catch(error){$('#status').textContent=error.message;}finally{busy=false;}}
function actions(card,row){const wrap=element('div','','library-card-actions');if(row.is_active){const edit=element('button','編輯','secondary'),disable=element('button','停用','ghost-button');edit.onclick=()=>openForm(row);disable.onclick=()=>changeState(row,false);wrap.append(edit,disable);}else{const restore=element('button','恢復使用','secondary');restore.onclick=()=>changeState(row,true);wrap.append(restore);}card.append(wrap);}
function filteredRows(){const term=normalize($('#search').value),category=$('#category').value,state=$('#state').value;return rows.filter(row=>(!term||normalize(mode==='today'?[row.category,row.scripture_ref,row.scripture,row.prayer_text].join(' '):[row.category,row.title,row.share_caption].join(' ')).includes(term))&&(!category||row.category===category)&&(state==='all'||Boolean(row.is_active)===(state==='active')));}
function renderCategories(){const selected=$('#category').value,categories=[...new Set(rows.map(row=>row.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));$('#category').replaceChildren(new Option(mode==='today'?'全部分類':'全部情境',''),...categories.map(value=>new Option(value,value)));if(categories.includes(selected))$('#category').value=selected;}
function render(){const area=$('#items'),matches=filteredRows(),pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));if(page>pages)page=pages;const visible=matches.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);area.replaceChildren();
  for(const row of visible){const card=element('article','','library-card'+(row.is_active?'':' is-inactive'));card.append(element('span',row.category||'未分類','status-badge'));
    if(mode==='today'){card.append(element('h3',row.scripture_ref),element('blockquote','「'+row.scripture+'」','scripture-copy'),element('p',row.prayer_text,'library-note'));}
    else{const image=document.createElement('img');image.className='library-image';image.alt=row.title;image.loading='lazy';attachImage(image,row.image_url);card.append(image,element('h3',row.title),element('p',row.share_caption,'scripture-copy'));}
    actions(card,row);area.append(card);
  }
  if(!visible.length)area.append(element('div','找不到符合條件的內容。','empty-state'));
  $('#active-count').textContent=rows.filter(row=>row.is_active).length;$('#status').textContent=`共 ${matches.length} 筆符合條件，第 ${page} / ${pages} 頁。`;
  const nav=$('#pagination');nav.replaceChildren();if(pages>1){const previous=element('button','上一頁','secondary'),label=element('span',`${page} / ${pages}`),next=element('button','下一頁','secondary');previous.disabled=page===1;next.disabled=page===pages;previous.onclick=()=>{page--;render();scrollTo({top:0,behavior:'smooth'});};next.onclick=()=>{page++;render();scrollTo({top:0,behavior:'smooth'});};nav.append(previous,label,next);}
}
async function load(){closeEditor();$('#status').textContent='正在載入內容庫…';try{rows=mode==='today'?await listTodaysMessages(db,church):await listLoveShareCards(db,church);renderCategories();render();}catch(error){rows=[];$('#status').textContent=error.message;}}

$('#title').textContent=churchName()+' · '+(mode==='today'?'給今天的你':'把愛傳出去');$('#settings').href='church-settings.html?church='+encodeURIComponent(church||'');$('#new').onclick=()=>openForm();for(const id of ['#search','#category','#state'])$(id).addEventListener(id==='#search'?'input':'change',()=>{page=1;render();});load();
