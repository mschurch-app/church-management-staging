import {contentWorkflow} from './content-workflow.mjs?v=20261023-content1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {listTodaysMessages,listLoveShareCards,listLoveShareScenarios,saveSpiritualCard,saveGreeting,saveLoveShareScenario,setLoveShareScenarioActive,setContentActive,uploadGreetingImage,greetingPreview} from './pastoral-content-management.mjs?v=20261023-content1';

const $=selector=>document.querySelector(selector);
const values=new URLSearchParams(location.search).getAll('church');
const church=values.length===1?values[0]:null;
const mode=document.body.dataset.library;
const PAGE_SIZE=24;
let rows=[],scenarios=[],page=1;

function element(tag,text='',className=''){const node=document.createElement(tag);node.textContent=text;node.className=className;return node;}
function control(type,value=''){const node=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')node.type=type;node.value=value??'';return node;}
function field(label,node,full=false,hint=''){const wrapper=element('label','',full?'full-width':'');wrapper.append(document.createTextNode(label),node);if(hint)wrapper.append(element('small',hint,'field-hint'));return wrapper;}
function churchName(){return church==='M+'?'M＋大雅教會':'火樂教會';}
function resetEditor(){const editor=$('#editor');editor.hidden=true;editor.replaceChildren();}
function normalize(text){return String(text||'').toLocaleLowerCase('zh-Hant');}
function scenarioFor(name){return scenarios.find(item=>item.name===name);}
function activeScenarios(){return scenarios.filter(item=>item.is_active);}

async function imageSource(path){if(/^https:\/\//i.test(path||''))return path;return greetingPreview(db,path);}
async function attachImage(img,path){try{img.src=await imageSource(path);}catch{img.alt='圖片目前無法預覽';img.classList.add('image-unavailable');}}

function openForm(row=null){
  if(!flow.ready||!flow.canLeave())return;flow.discard();
  const editor=$('#editor'),form=document.createElement('form'),grid=element('div','','edit-grid'),actions=element('div','','editor-actions');
  editor.replaceChildren();editor.hidden=false;
  if(mode==='today'){
    const reference=control('text',row?.scripture_ref||''),scripture=control('textarea',row?.scripture||''),prayer=control('textarea',row?.prayer_text||'');
    reference.required=scripture.required=prayer.required=true;
    reference.placeholder='例如：詩篇 23:1';scripture.placeholder='輸入完整經文';prayer.placeholder='輸入要隨經文顯示的牧者祝福';
    const purpose=control('text','給今天的你');purpose.disabled=true;grid.append(field('經文出處',reference),field('內容用途',purpose),field('經文內容',scripture,true),field('牧者祝福',prayer,true));
    form.onsubmit=event=>submit(event,form,()=>saveSpiritualCard(db,church,{category:'給今天的你',scripture_ref:reference.value,scripture:scripture.value,prayer_text:prayer.value},row));
  }else{
    const category=document.createElement('select'),title=control('text',row?.title||''),caption=control('textarea',row?.share_caption||''),file=control('file'),available=activeScenarios();
    for(const item of available)category.append(new Option(`${item.icon} ${item.name}`,item.name));if(row?.category&&!available.some(item=>item.name===row.category))category.append(new Option(`${scenarioFor(row.category)?.icon||'💛'} ${row.category}（目前關閉）`,row.category));category.value=row?.category||available[0]?.name||'';
    category.required=title.required=caption.required=true;file.accept='image/jpeg,image/png,image/webp';if(!row)file.required=true;
    title.placeholder='圖卡顯示標題';caption.placeholder='輸入經文、出處與祝福文字';
    grid.append(field('祝福情境',category),field('圖卡標題',title),field('經文／祝福內容',caption,true,'此內容會隨圖卡一起分享。'),field(row?'更換照片（選填）':'照片',file,true,'JPG、PNG 或 WebP，檔案大小 5MB 以內。'));
    form.onsubmit=event=>submit(event,form,async()=>{let path=row?.image_url||'';if(file.files[0])path=await uploadGreetingImage(db,church,file.files[0]);return saveGreeting(db,church,{category:category.value,title:title.value,share_caption:caption.value,image_url:path},row);});
  }
  const cancel=element('button','取消','secondary'),save=element('button','儲存');cancel.type='button';cancel.onclick=()=>{if(flow.canLeave())flow.discard();};save.dataset.write="true";save.type="submit";actions.append(cancel,save);
  form.prepend(element('h2',row?'編輯內容':mode==='today'?'新增經文':'新增祝福圖卡'));form.append(grid,actions);const result=element("p","","status-message");result.dataset.editorResult="true";result.setAttribute("role","status");result.hidden=true;form.insertBefore(result,actions);editor.append(form);flow.track(form);editor.scrollIntoView({behavior:'smooth',block:'start'});form.querySelector('input,textarea')?.focus();
}

async function submit(event,form,save){event.preventDefault();await flow.write(save,'內容已儲存，LINE 內容庫已更新。');}
function renderScenarios(){if(mode!=='love')return;const area=$('#scenario-list');area.replaceChildren();for(const row of scenarios){const card=element('article','',`scenario-card${row.is_active?'':' is-inactive'}`),identity=element('div','','scenario-identity'),icon=element('span',row.icon,'scenario-icon'),copy=element('div');copy.append(element('strong',row.name),element('small',row.is_active?'LINE 會友目前看得到此情境':'已關閉，相關圖卡仍完整保留'));identity.append(icon,copy);const toggle=element('button',row.is_active?'關閉情境':'重新開放',row.is_active?'ghost-button':'secondary');toggle.type='button';toggle.dataset.write='true';toggle.onclick=()=>changeScenarioState(row,!row.is_active);card.append(identity,toggle);area.append(card);}if(!scenarios.length)area.append(element('div','尚未建立祝福情境。','empty-state'));}
async function addScenario(event){event.preventDefault();await flow.write(()=>saveLoveShareScenario(db,church,{name:$('#scenario-name').value,icon:$('#scenario-icon').value}),'新情境已新增。');}
async function changeScenarioState(row,active){if(!flow.ready||!flow.canLeave()||!confirm(active?`重新開放「${row.name}」？`:`關閉「${row.name}」？相關圖卡會暫時從 LINE 隱藏，資料會保留。`))return;await flow.write(()=>setLoveShareScenarioActive(db,church,row,active),active?'情境已重新開放。':'情境已關閉。');}
async function changeState(row,active){if(!flow.ready||!flow.canLeave()||!confirm((active?'恢復':'停用')+'這筆內容？資料會保留。'))return;await flow.write(()=>setContentActive(db,church,mode==='today'?'spiritual_cards':'share_greeting_cards',row,active),active?'內容已恢復。':'內容已停用。');}
function actions(card,row){const wrap=element('div','','library-card-actions');if(row.is_active){const edit=element('button','編輯','secondary'),disable=element('button','停用','ghost-button');edit.onclick=()=>openForm(row);disable.onclick=()=>changeState(row,false);wrap.append(edit,disable);}else{const restore=element('button','恢復使用','secondary');restore.onclick=()=>changeState(row,true);wrap.append(restore);}wrap.querySelectorAll("button").forEach(n=>{n.type="button";n.dataset.write="true";});card.append(wrap);}
function filteredRows(){const term=normalize($('#search').value),category=$('#category').value,state=$('#state').value;return rows.filter(row=>(!term||normalize(mode==='today'?[row.category,row.scripture_ref,row.scripture,row.prayer_text].join(' '):[row.category,row.title,row.share_caption].join(' ')).includes(term))&&(!category||row.category===category)&&(state==='all'||Boolean(row.is_active)===(state==='active')));}
function renderCategories(){const selected=$('#category').value,categories=mode==='love'?[...new Set([...scenarios.map(row=>row.name),...rows.map(row=>row.category)].filter(Boolean))]:[...new Set(rows.map(row=>row.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));$('#category').replaceChildren(new Option(mode==='today'?'全部分類':'全部情境',''),...categories.map(value=>new Option(value,value)));if(categories.includes(selected))$('#category').value=selected;}
function render(){const area=$('#items'),matches=filteredRows(),pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));if(page>pages)page=pages;const visible=matches.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);area.replaceChildren();
  for(const row of visible){const scenario=scenarioFor(row.category),effective=row.is_active&&(mode!=='love'||scenario?.is_active!==false),card=element('article','','library-card'+(effective?'':' is-inactive'));card.append(element('span',(scenario?.icon?scenario.icon+' ':'')+(row.category||'未分類')+(scenario?.is_active===false?' · 情境已關閉':''),'status-badge'));
    if(mode==='today'){card.append(element('h3',row.scripture_ref),element('blockquote','「'+row.scripture+'」','scripture-copy'),element('p',row.prayer_text,'library-note'));}
    else{const image=document.createElement('img');image.className='library-image';image.alt=row.title;image.loading='lazy';attachImage(image,row.image_url);card.append(image,element('h3',row.title),element('p',row.share_caption,'scripture-copy'));}
    actions(card,row);area.append(card);
  }
  if(!visible.length)area.append(element('div','找不到符合條件的內容。','empty-state'));
  $('#active-count').textContent=rows.filter(row=>row.is_active&&(mode!=='love'||scenarioFor(row.category)?.is_active!==false)).length;$('#result-count').textContent=`共 ${matches.length} 筆符合條件，第 ${page} / ${pages} 頁。`;
  const nav=$('#pagination');nav.replaceChildren();if(pages>1){const previous=element('button','上一頁','secondary'),label=element('span',`${page} / ${pages}`),next=element('button','下一頁','secondary');previous.disabled=page===1;next.disabled=page===pages;previous.onclick=()=>{page--;render();flow.update();scrollTo({top:0,behavior:'smooth'});};next.onclick=()=>{page++;render();flow.update();scrollTo({top:0,behavior:'smooth'});};nav.append(previous,label,next);}
}
const flow=contentWorkflow({db,
 read:async()=>mode==='today'?{rows:await listTodaysMessages(db,church),scenarios:[]}:{rows:await listLoveShareCards(db,church),scenarios:await listLoveShareScenarios(db,church)},
 apply:result=>{rows=result.rows;scenarios=result.scenarios;renderCategories();renderScenarios();render();},
 clear:()=>{rows=[];scenarios=[];$('#items').replaceChildren();$('#pagination').replaceChildren();$('#scenario-list')?.replaceChildren();$('#active-count').textContent='—';$('#result-count').textContent='尚未載入內容。';},
 reset:()=>{resetEditor();if(mode==='love'){$('#scenario-form').reset();$('#scenario-panel').hidden=true;}}
});
$('#reload').onclick=()=>flow.load();
$('#title').textContent=churchName()+' · '+(mode==='today'?'給今天的你':'把愛傳出去');$('#settings').href='church-settings.html?church='+encodeURIComponent(church||'');$('#new').onclick=()=>{if(mode==='love'&&!activeScenarios().length){$('#scenarios').click();$('#status').textContent='請先新增或開放至少一個祝福情境。';return;}openForm();};if(mode==='love'){$('#scenarios').onclick=()=>{if(!flow.ready||!flow.canLeave())return;flow.discard();flow.track($('#scenario-form'));$('#scenario-panel').hidden=false;$('#scenario-panel').scrollIntoView({behavior:'smooth',block:'start'});};$('#scenario-close').onclick=()=>{if(flow.canLeave())flow.discard();};$('#scenario-form').onsubmit=addScenario;}for(const id of ['#search','#category','#state'])$(id).addEventListener(id==='#search'?'input':'change',()=>{page=1;render();flow.update();});flow.load();
