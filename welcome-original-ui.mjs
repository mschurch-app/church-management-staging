import {getOptions} from './welcome-options.mjs';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20260924-custom1';
import {mountMemberPanel} from './member-welcome-ui.mjs?v=20260928-profile-card2';
const db=window.supabase.createClient('https://aqanuwilmvdtlzuqlrau.supabase.co','sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const churches=new URLSearchParams(location.search).getAll('church'),church=churches.length===1?churches[0]:null;
const $=id=>document.getElementById(id),status=$('formStatus');
let options,layout=[],selection={},photo,pending,busy=false;
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
