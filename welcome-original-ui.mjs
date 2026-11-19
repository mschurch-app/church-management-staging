import {recordFormEvent} from './member-form-trace.mjs?v=20261119-flowtrace1';
import {mountMemberClaim} from './member-claim-ui.mjs?v=20261119-flowtrace1';
import {onboardingCredentials,continueWithoutRegistration,safeMemberReturn} from './member-onboarding.mjs?v=20261119-flowtrace1';
import {getOptions} from './welcome-options.mjs';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20261102-bibletree-admin1';
import {mountMemberPanel} from './member-welcome-ui.mjs?v=20261119-reconfirm1';
const db=window.supabase.createClient('https://aqanuwilmvdtlzuqlrau.supabase.co','sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const churches=new URLSearchParams(location.search).getAll('church'),church=churches.length===1?churches[0]:null;
const $=id=>document.getElementById(id),status=$('formStatus'),submitFeedback=$('submitFeedback');
const defaultSubmitText='確認並送出資料';
function feedback(message,tone='error'){status.textContent=message;submitFeedback.textContent=message;const notice=$('submitNotice');notice.textContent=message;notice.dataset.tone=tone;notice.hidden=!message;}
$('formSection').addEventListener('input',()=>{if(!busy&&!preparing)$('submitNotice').hidden=true;});
if(church==='SHiNE'){
 document.title='火樂教會 · 遇見你真好';
 $('pageMainTitle').textContent='火樂教會 · 歡迎回家';
}else if(church==='M+')document.title='M＋大雅教會 · 遇見你真好';
let options,layout=[],selection={},photo,pending,busy=false,preparing=false,memberClaim;
function trace(stage,code){recordFormEvent(stage,code,pending?.request_id,church);}
const groups={gender:'groupGender',age:'groupAge',district:'groupDistrict',source:'groupKnow',faith:'groupFaithStatus',feelings:'groupFeelings',interests:'groupInterests'};
const multi=key=>['feelings','interests'].includes(key);
const rule=key=>layout.find(item=>item.key===key)||{visible:true,required:false};
function layoutNodes(){return{identity:$('guestName').parentElement.parentElement,phone:$('guestPhone').parentElement,birthday:$('guestBirthday').parentElement,age:$('groupAge').parentElement,district:$('groupDistrict').parentElement,source:$('groupKnow').parentElement,faith:$('groupFaithStatus').parentElement,feelings:$('groupFeelings').parentElement,interests:$('groupInterests').parentElement,photo:$('photoLabelText').parentElement.parentElement};}
function applyLayout(){const wrapper=$('newcomerFieldsWrapper');if(wrapper?.parentElement){for(const child of [...wrapper.children])wrapper.before(child);wrapper.remove();}const nodes=layoutNodes();for(const item of layout){const node=nodes[item.key];if(!node)continue;node.hidden=!item.visible;node.dataset.customField=item.key;node.style.order=String(item.sort_order||0);const label=item.key==='photo'?$('photoLabelText'):node.querySelector(':scope > label');if(label)label.textContent=item.label+(item.required?' *':'');for(const input of node.querySelectorAll('input,textarea,select'))if(!['radio','checkbox','file'].includes(input.type))input.required=Boolean(item.visible&&item.required);}for(const parent of new Set(Object.values(nodes).map(node=>node?.parentElement).filter(Boolean))){[...parent.children].filter(node=>node.dataset.customField).sort((a,b)=>(Number(rule(a.dataset.customField).sort_order)||0)-(Number(rule(b.dataset.customField).sort_order)||0)).forEach(node=>parent.append(node));}}
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
 busy=true;lock(true);$('btnSubmitText').textContent='正在處理照片…';feedback('正在處理照片，請稍候…','busy');
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let encoded=canvas.toDataURL('image/jpeg',0.78);
  if(encoded.length>330000)encoded=canvas.toDataURL('image/jpeg',0.5);
  if(encoded.length>330000)throw Error();
  photo=encoded;$('photoPreview').src=photo;$('photoPreview').classList.remove('hidden');$('photoPlaceholder').classList.add('hidden');feedback('照片已準備好，請按「確認並送出資料」。','ready');
 }catch{feedback('無法讀取這張照片，請改用 JPG 或 PNG，或重新拍照。');}
 finally{bitmap?.close();busy=false;lock(false);$('btnSubmitText').textContent=defaultSubmitText;}
}
$('cameraButton').onclick=()=>$('cameraInput').click();
$('galleryButton').onclick=()=>$('galleryInput').click();
$('cameraInput').onchange=selectPhoto;$('galleryInput').onchange=selectPhoto;
$('btnClosePage').onclick=()=>{const next=new URLSearchParams(location.search).get('next');if(next){location.replace(safeMemberReturn(next));return;}$('closeTipText').classList.remove('hidden');window.close();};
async function submitRegistration(){
 trace('submit_attempt','clicked');
 if(busy||preparing){feedback(preparing?'正在核對身分，請稍候…':'正在送出登記，請稍候…','busy');return;}if(!options){trace('validation_blocked','options_unavailable');const message='表單設定尚未載入，請重新整理後再試。';feedback(message);return;}
 const retrying=Boolean(pending);if(!pending){
  const name=$('guestName').value.trim(),phone=$('guestPhone').value.trim();
  const missing=requiredMissing();if(missing){trace('validation_blocked',missing.key==='identity'?(!$('guestName').value.trim()?'missing_name':'missing_gender'):'missing_'+(['phone','birthday','age','district','source','faith','feelings','interests','photo'].includes(missing.key)?missing.key:'other'));const label=missing.key==='identity'?(!$('guestName').value.trim()?'姓名':'稱呼／性別（請選擇一項）'):missing.label;feedback('請完成必填項目：「'+label+'」。');const target=layoutNodes()[missing.key];target?.scrollIntoView({behavior:'smooth',block:'center'});target?.querySelector('input:not([type=hidden]),button')?.focus({preventScroll:true});return;}
  let source=selection.source[0]||'',faith=selection.faith[0]||'';
  if(options.source.find(x=>x.value===source)?.detail==='inviter'&&$('inviterName').value.trim())source+=' ('+$('inviterName').value.trim()+')';
  const origin=[...$('groupFaithStatus').querySelectorAll('[data-origin]')].find(x=>x.dataset.origin===faith)?.value.trim();
  if(origin)faith+=' (原屬：'+origin+')';
  const note='【新朋友初次見面】來源：'+source+'。期待：'+selection.feelings.join('、')+'。興趣：'+selection.interests.join('、')+(faith?'。信仰背景：'+faith:'');
  let claimFields,claimBlocked=false;preparing=true;lock(true);$('btnSubmitText').textContent='正在核對身分…';feedback('正在核對姓名與 LINE 身分，請稍候…','busy');$('btnSubmit').setAttribute('aria-busy','true');try{if(!memberClaim)throw Error('姓名核對功能尚未準備好，請稍後重試。');claimFields=await memberClaim.beforeSubmit();}catch(e){trace('identity_blocked',e.code||'identity_unavailable');feedback(e.message||'身分核對未完成，填寫內容已保留，請稍後再試。');claimBlocked=true;return;}finally{preparing=false;lock(false);$('btnSubmit').setAttribute('aria-busy','false');$('btnSubmitText').textContent=defaultSubmitText;if(claimBlocked)memberClaim?.focus?.();}
  pending={...claimFields,kind:'newcomer',church,request_id:crypto.randomUUID(),name,phone,birthday:$('guestBirthday').value.trim(),gender:selection.gender[0]||'',age_group:selection.age[0]||'',district:selection.district[0]||'',source,feelings:selection.feelings,interests:selection.interests,note,...(photo?{photo}:{})};
 }
 const button=$('btnSubmit'),buttonText=$('btnSubmitText'),waitMessage=retrying?'正在重送同一筆登記，請稍候…':'正在送出登記，請稍候…';busy=true;lock(true);button.setAttribute('aria-busy','true');buttonText.textContent=retrying?'正在重試…':'正在送出…';feedback(waitMessage,'busy');
 try{
  const credentials=await onboardingCredentials(church);
  if(new URLSearchParams(location.search).get('onboarding')==='1'&&!Object.keys(credentials).length)throw Error('LINE 登入已過期，請返回原功能重新登入；資料仍保留。');
  trace('request_started','sending');
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/newcomer-register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify({...pending,...credentials}),signal:AbortSignal.timeout(45000)});
  if(response.status===400||response.status===413){pending=null;lock(false);throw Error('資料或照片格式不正確，請檢查後再送出。');}
  if(response.status===401)throw Error('LINE 登入已過期，請重新登入後重試同一筆登記。');
  if(response.status===409){const error=await response.json();if(error.error==='claim_expired'){pending=null;lock(false);memberClaim?.resetProof();throw Error('核對已逾時或名冊已更新，請重新核對後送出。');}if(['already_bound','review_required'].includes(error.error)){pending=null;lock(false);throw Error(error.error==='already_bound'?'這個 LINE 已有會友資料，請重新查詢身份，不需要重複登記。':'可能已有資料或原綁定需要確認，請聯絡教會同工核對；已填資料仍保留，勿重複建檔。');}}
  if(response.status===429)throw Error('目前登記較多，請稍後按重試。');
  const outcome=await response.json();if(!response.ok||outcome.accepted!==true)throw Error('尚未確認完整送出，請按重試同一筆登記。');
  trace('server_result',outcome.pendingReview?'pending_review':'accepted');
  if(outcome.pendingReview){for(const id of ['onboarding-invitation','onboarding-later'])if($(id)){$(id).hidden=true;$(id).classList.add('hidden');}$('successMessage').textContent='資料已送請同工確認。尚未完成 LINE 綁定，確認後才能使用會友功能；不需要重複送出。';$('memberIdentityPanel')?.classList.add('hidden');}
  if(outcome.lineBound){for(const id of ['onboarding-invitation','onboarding-later'])if($(id)){$(id).hidden=true;$(id).classList.add('hidden');}$('successMessage').textContent=outcome.existingMember?'既有會友資料已補齊，LINE 也已完成綁定。下次登入可直接使用會友服務。':'新朋友資料已建立，LINE 也已完成綁定。下次登入可直接使用會友服務。';$('memberIdentityPanel')?.classList.add('hidden');}
  button.setAttribute('aria-busy','false');$('successName').textContent=pending.name;$('formSection').classList.add('hidden');$('successSection').classList.remove('hidden');status.textContent='';submitFeedback.textContent='';$('submitNotice').hidden=true;$('successSection').scrollIntoView({block:'start',behavior:'smooth'});photo=null;pending=null;
 }catch(e){trace('server_result',e.name==='TimeoutError'||e instanceof TypeError?'network_unconfirmed':'server_rejected');const message=e.name==='TimeoutError'?'連線逾時，請按重試同一筆登記。':e.message;feedback(message);buttonText.textContent=pending?'重試同一筆登記':defaultSubmitText;button.setAttribute('aria-busy','false');button.disabled=false;}
 finally{busy=false;}
}
$('btnSubmit').onclick=()=>{void submitRegistration().catch(()=>{trace('server_result','unexpected');busy=preparing=false;if(!pending)lock(false);$('btnSubmit').disabled=false;$('btnSubmit').setAttribute('aria-busy','false');$('btnSubmitText').textContent=pending?'重試同一筆登記':defaultSubmitText;feedback('送出尚未完成，填寫內容已保留。請重試；若仍無法送出，請聯絡教會同工。');});};
for(const [id,max] of [['guestName',80],['guestPhone',40],['guestBirthday',40],['inviterName',100]])$(id).maxLength=max;
lock(true);
mountMemberPanel();
if(new URLSearchParams(location.search).get('next'))$('btnClosePage').querySelector('span').textContent='完成，返回原功能';
if(new URLSearchParams(location.search).get('onboarding')==='1'&&new URLSearchParams(location.search).get('reconfirm')!=='1'){
 const invite=document.createElement('p');invite.id='onboarding-invitation';invite.textContent='歡迎你！請先留下新朋友資料，完成後會直接綁定 LINE。';invite.className='text-center text-sm mb-3';$('formSection').before(invite);
 const later=document.createElement('button');later.id='onboarding-later';later.type='button';later.textContent='稍後填寫，繼續使用';later.className='w-full py-3 rounded-2xl border border-stone-200 mb-4';later.onclick=async()=>{if(busy||pending){status.textContent=busy?'正在送出，請稍候。':'請先重試確認上一筆登記結果，再返回原功能。';return;}try{await continueWithoutRegistration(church,new URLSearchParams(location.search).get('next'));}catch{status.textContent='暫時無法返回，請稍後再試。';}};invite.after(later);
}
try{
 const [data,customizations]=await Promise.all([getOptions(db,church),loadChurchCustomizations(db,church)]);options=data.options;layout=customizations.welcome_fields;applyLayout();
 for(const key of Object.keys(groups)){selection[key]=options[key].filter(x=>x.selected).map(x=>x.value);renderGroup(key);}
 sourceDetail();lock(false);
 memberClaim=mountMemberClaim({church,nameInput:$('guestName'),onPrefill:member=>{
  const previous={},groupPrevious={};
  for(const [key,id]of [['phone','guestPhone'],['birthday','guestBirthday']]){const field=$(id);if(member[key]){previous[id]={value:field.value,readOnly:field.readOnly,prefilled:member[key]};field.value=member[key];field.readOnly=true;}}
  for(const [key,group]of [['gender','gender'],['district','district'],['age_group','age'],['faith_status','faith'],['know_us_from','source'],['desired_feelings','feelings'],['interest_tags','interests']]){const values=Array.isArray(member[key])?member[key]:member[key]?[member[key]]:[];if(!values.length)continue;groupPrevious[group]={previous:[...selection[group]],prefilled:values};for(const value of values)if(!options[group].some(o=>o.value===value))options[group].push({value,label:value});selection[group]=values;renderGroup(group);}sourceDetail();
  return ()=>{for(const [id,old]of Object.entries(previous)){const field=$(id);if(field.value===old.prefilled)field.value=old.value;field.readOnly=old.readOnly;}for(const [group,old]of Object.entries(groupPrevious)){if(JSON.stringify(selection[group])===JSON.stringify(old.prefilled))selection[group]=old.previous;renderGroup(group);}sourceDetail();};
 }});

}catch(e){feedback(e.message||'表單設定暫時無法載入，請保留已填文字後重新開啟。');}

