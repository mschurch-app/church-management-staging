import {db} from './admin-db.mjs';import {readAccess,canOpen} from './admin-access.mjs';import {getOptions,GROUPS} from './welcome-options.mjs';
const church=new URLSearchParams(location.search).get('church'),area=document.querySelector('#options'),status=document.querySelector('#status'),save=document.querySelector('#save');
let current,version,generation=0,saving=false;
for(const [id,page] of [['back-members','members.html'],['preview-form','newcomer.html']])document.getElementById(id).href=page+'?church='+encodeURIComponent(church||'');
const el=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
async function allowed(){if(!canOpen(await readAccess(db),church,'members'))throw Error('沒有此堂會的迎新設定權限。');}
function render(){
 area.replaceChildren();
 for(const [key,title] of Object.entries(GROUPS)){
  const section=el('section','');section.append(el('h2',title));
  current[key].forEach((option,index)=>{
   const row=el('article','');
   for(const [field,label] of [['label','顯示文字'],['value','儲存值']]){
    const wrap=el('label',label),input=document.createElement('input');input.value=option[field];input.maxLength=field==='label'?200:100;input.oninput=()=>option[field]=input.value;wrap.append(input);row.append(wrap);
   }
   const wrap=el('label','預設選取'),checked=document.createElement('input');checked.type='checkbox';checked.checked=option.selected;
   checked.onchange=()=>{if(checked.checked&&!['feelings','interests'].includes(key))current[key].forEach(x=>x.selected=false);option.selected=checked.checked;render();};wrap.append(checked);row.append(wrap);
   if(['source','faith'].includes(key)){
    const label=el('label','選取後的補充欄位'),select=document.createElement('select');
    for(const [value,text] of [['','無'],...(key==='source'?[['inviter','邀請人']]:[['origin1','原屬教會（臨時來訪）'],['origin2','原屬教會（尋找教會）']])])select.append(new Option(text,value));
    select.value=option.detail||'';select.onchange=()=>option.detail=select.value;label.append(select);row.append(label);
   }
   for(const [label,action] of [['上移',()=>{if(index>0){[current[key][index-1],current[key][index]]=[option,current[key][index-1]];render();}}],['移除此選項',()=>{if(current[key].length>1){current[key].splice(index,1);render();}}]]){
    const b=el('button',label);b.onclick=action;row.append(b);
   }
   section.append(row);
  });
  const add=el('button','新增選項');add.onclick=()=>{if(current[key].length<30){current[key].push({label:'新選項',value:'新選項',selected:false});render();}};section.append(add);area.append(section);
 }
}
async function load(reuse=false){
 const ticket=++generation;area.replaceChildren();save.disabled=true;
 try{await allowed();const data=reuse&&current?{options:current,version}:await getOptions(db,church);if(ticket!==generation)return;current=structuredClone(data.options);version=data.version;render();save.disabled=saving;status.textContent=(church==='M+'?'M+':'火樂')+' · 選項已載入';}catch(e){status.textContent=e.message;}
}
save.onclick=async()=>{
 if(saving)return;saving=true;save.disabled=true;const snapshot=structuredClone(current),expected=version,ticket=generation;
 area.querySelectorAll('input,select,button').forEach(x=>x.disabled=true);
 try{
  await allowed();
  const {data,error}=await db.from('welcome_form_options').update({options:snapshot,version:expected+1,updated_at:new Date().toISOString()}).eq('church_id',church).eq('version',expected).select('version');
  if(error||data?.length!==1)throw Error('未儲存：請檢查空白、重複值與預設選項；若別人已修改，請重整後再編輯。');
  version=data[0].version;status.textContent='已儲存。新開啟的迎新表單會使用這些選項。';
 }catch(e){if(ticket===generation)status.textContent=e.message;}finally{saving=false;if(ticket===generation&&!document.hidden){save.disabled=false;area.querySelectorAll('input,select,button').forEach(x=>x.disabled=false);}}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;area.replaceChildren();save.disabled=true;}else load(true);});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;area.replaceChildren();save.disabled=true;status.textContent='請重新登入。';}});
load();
