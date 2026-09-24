import {getOptions} from './welcome-options.mjs';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20260924-custom1';
const db=window.supabase.createClient('https://aqanuwilmvdtlzuqlrau.supabase.co','sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const churches=new URLSearchParams(location.search).getAll('church'),church=churches.length===1?churches[0]:null;
const $=id=>document.getElementById(id),status=$('formStatus');
let options,layout=[],selection={},photo,pending,busy=false;
const groups={gender:'groupGender',age:'groupAge',district:'groupDistrict',source:'groupKnow',faith:'groupFaithStatus',feelings:'groupFeelings',interests:'groupInterests'};
const multi=key=>['feelings','interests'].includes(key);
const rule=key=>layout.find(item=>item.key===key)||{visible:true,required:false};
function layoutNodes(){return{identity:$('guestName').parentElement.parentElement,phone:$('guestPhone').parentElement,birthday:$('guestBirthday').parentElement,age:$('groupAge').parentElement,district:$('groupDistrict').parentElement,source:$('groupKnow').parentElement,faith:$('groupFaithStatus').parentElement,feelings:$('groupFeelings').parentElement,interests:$('groupInterests').parentElement,photo:$('photoLabelText').parentElement.parentElement};}
function applyLayout(){const nodes=layoutNodes();for(const item of layout){const node=nodes[item.key];if(!node)continue;node.hidden=!item.visible;node.dataset.customField=item.key;node.style.order=String(item.sort_order||0);const label=item.key==='photo'?$('photoLabelText'):node.querySelector(':scope > label');if(label)label.textContent=item.label+(item.required?' *':'');for(const input of node.querySelectorAll('input,textarea,select'))if(!['radio','checkbox','file'].includes(input.type))input.required=Boolean(item.visible&&item.required);}for(const parent of new Set(Object.values(nodes).map(node=>node?.parentElement).filter(Boolean))){[...parent.children].filter(node=>node.dataset.customField).sort((a,b)=>(Number(rule(a.dataset.customField).sort_order)||0)-(Number(rule(b.dataset.customField).sort_order)||0)).forEach(node=>parent.append(node));}}
function requiredMissing(){const tests={identity:()=>!$('guestName').value.trim()||!selection.gender?.length,phone:()=>!$('guestPhone').value.trim(),birthday:()=>!$('guestBirthday').value.trim(),age:()=>!selection.age?.length,district:()=>!selection.district?.length,source:()=>!selection.source?.length,faith:()=>!selection.faith?.length,feelings:()=>!selection.feelings?.length,interests:()=>!selection.interests?.length,photo:()=>!photo};for(const item of layout)if(item.visible&&item.required&&tests[item.key]?.())return item;return null;}
function renderGroup(key){
 const area=$(groups[key]);area.replaceChildren();
 for(const option of options[key]){
  const active=selection[key].includes(option.value);
  if(key==='faith'){
   const label=document.createElement('label');label.className='flex items-start gap-2.5 p-3 rounded-2xl bg-stone-50 border border-stone-200/80 cursor-pointer text-xs text-stone-800 font-bold';
   const radio=document.createElement('input');radio.type='radio';radio.name='faithRadio';radio.value=option.value;radio.checked=active;radio.className='mt-0.5 accent-orange-600 w-4 h-4';
   const box=document.createElement('div');box.className='flex-1 space-y-1.5';const span=document.createElement('span');span.textContent=option.label;box.append(span);
   if(option.detail?.startsWith('origin')){
    const input=document.createElement('input');input.type='text';input.maxLength=100;input.placeholder='請填寫原屬教會名稱...';input.dataset.origin=option.value;input.className='w-full bg-white border border-stone-200 rounded-xl p-2 text-xs text-stone-800 focus:outline-none';input.hidden=!active;box.append(input);
   }
   radio.onchange=()=>{selection.faith=[option.value];area.querySelectorAll('[data-origin]').forEach(x=>x.hidden=x.dataset.origin!==option.value);};
   label.append(radio,box);area.append(label);
  }else{
   const b=document.createElement('button');b.type='button';b.className='pill-btn'+(active?' active':'')+(key==='gender'?' flex-1 justify-center':'');b.textContent=option.label;b.setAttribute('aria-pressed',String(active));
   b.onclick=()=>{if(busy||pending)return;selection[key]=multi(key)?(active?selection[key].filter(x=>x!==option.value):[...selection[key],option.value]):[option.value];renderGroup(key);if(key==='source')sourceDetail();};
   area.append(b);
  }
 }
}
function sourceDetail(){$('inviterWrapper').hidden=options.source.find(x=>x.value===selection.source[0])?.detail!=='inviter';}
function lock(value){$('formSection').querySelectorAll('button,input').forEach(e=>e.disabled=value);}
async function selectPhoto(event){
 const file=event.target.files[0];if(!file||busy||pending)return;
 if(file.size>15000000){status.textContent='照片太大，請選擇 15 MB 以下的照片。';return;}
 busy=true;lock(true);status.textContent='正在處理照片…';
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let encoded=canvas.toDataURL('image/jpeg',0.78);
  if(encoded.length>330000)encoded=canvas.toDataURL('image/jpeg',0.5);
  if(encoded.length>330000)throw Error();
  photo=encoded;$('photoPreview').src=photo;$('photoPreview').classList.remove('hidden');$('photoPlaceholder').classList.add('hidden');status.textContent='';
 }catch{status.textContent='無法讀取這張照片，請改用 JPG 或 PNG，或重新拍照。';}
 finally{bitmap?.close();busy=false;lock(false);}
}
$('cameraButton').onclick=()=>$('cameraInput').click();
$('galleryButton').onclick=()=>$('galleryInput').click();
$('cameraInput').onchange=selectPhoto;$('galleryInput').onchange=selectPhoto;
$('btnClosePage').onclick=()=>{$('closeTipText').classList.remove('hidden');window.close();};
$('btnSubmit').onclick=async()=>{
 if(busy||!options)return;
 if(!pending){
  const name=$('guestName').value.trim(),phone=$('guestPhone').value.trim();
  const missing=requiredMissing();if(missing){status.textContent='請完成必填項目：「'+missing.label+'」。';layoutNodes()[missing.key]?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  let source=selection.source[0]||'',faith=selection.faith[0]||'';
  if(options.source.find(x=>x.value===source)?.detail==='inviter'&&$('inviterName').value.trim())source+=' ('+$('inviterName').value.trim()+')';
  const origin=[...$('groupFaithStatus').querySelectorAll('[data-origin]')].find(x=>x.dataset.origin===faith)?.value.trim();
  if(origin)faith+=' (原屬：'+origin+')';
  const note='【新朋友初次見面】來源：'+source+'。期待：'+selection.feelings.join('、')+'。興趣：'+selection.interests.join('、')+(faith?'。信仰背景：'+faith:'');
  pending={kind:'newcomer',church,request_id:crypto.randomUUID(),name,phone,birthday:$('guestBirthday').value.trim(),gender:selection.gender[0]||'',age_group:selection.age[0]||'',district:selection.district[0]||'',source,feelings:selection.feelings,interests:selection.interests,note,...(photo?{photo}:{})};
 }
 busy=true;lock(true);status.textContent='正在送出，請稍候…';
 try{
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/newcomer-register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(pending),signal:AbortSignal.timeout(45000)});
  if(response.status===400||response.status===413){pending=null;lock(false);throw Error('資料或照片格式不正確，請檢查後再送出。');}
  if(response.status===429)throw Error('目前登記較多，請稍後按重試。');
  if(!response.ok||(await response.json()).accepted!==true)throw Error('尚未確認完整送出，請按重試同一筆登記。');
  $('successName').textContent=pending.name;$('formSection').classList.add('hidden');$('successSection').classList.remove('hidden');status.textContent='';photo=null;pending=null;
 }catch(e){status.textContent=e.name==='TimeoutError'?'連線逾時，請按重試同一筆登記。':e.message;$('btnSubmitText').textContent=pending?'重試同一筆登記':'✨ 很高興認識你 · 留下今日印記';$('btnSubmit').disabled=false;}
 finally{busy=false;}
};
for(const [id,max] of [['guestName',80],['guestPhone',40],['guestBirthday',40],['inviterName',100]])$(id).maxLength=max;
lock(true);
try{
 const [data,customizations]=await Promise.all([getOptions(db,church),loadChurchCustomizations(db,church)]);options=data.options;layout=customizations.welcome_fields;applyLayout();
 for(const key of Object.keys(groups)){selection[key]=options[key].filter(x=>x.selected).map(x=>x.value);renderGroup(key);}
 sourceDetail();lock(false);
}catch(e){status.textContent=e.message;}
