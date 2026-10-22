import {DEVOTIONAL_FIELDS} from './devotional-draft-recovery.mjs?v=20261022-experience19';
const el=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
// Read-only comparison never reuses the old text with a newer expected version.
export function createDevotionalConflict({host,readCurrent,loadLatest,isBusy,setBusy,mayLeave,onUseLatest,onError}){
 let current=null,working=false,generation=0;
 function clear(){generation++;current=null;host.replaceChildren();host.hidden=true;}
 function render(){
  host.replaceChildren();host.hidden=!current;if(!current)return;
  const selected=current,heading=el('h3','這篇靈修已有變更'),copy=el('p','這次沒有儲存或核准。本頁輸入仍保留，可先使用「取回本頁內容」另存副本，再核對最新正式內容。不會自動合併。'),summary=el('p',`${selected.item.devotional_date} · 本頁開啟版本 ${selected.item.version}`),status=el('p',selected.status,'devotional-conflict-status'),actions=el('div','','devotional-conflict-actions'),read=el('button',selected.latest?'再次核對最新版':'核對最新正式內容','secondary');
  status.setAttribute('role','status');read.type='button';read.dataset.conflictAction='read';read.dataset.appControl='surface';read.disabled=working;read.onclick=()=>void run(false);actions.append(read);host.append(heading,copy,summary);
  if(selected.latest){
   host.append(el('p',`最新正式版本 ${selected.latest.version} · ${selected.latest.devotional_title}`));const comparison=el('div','','devotional-comparison'),mine=readCurrent()||selected.item;
   let differences=0;for(const [key,label]of Object.entries(DEVOTIONAL_FIELDS)){if((mine[key]||'')===(selected.latest[key]||''))continue;differences++;const section=el('fieldset'),legend=el('legend',label),columns=el('div','','devotional-comparison-columns');for(const [title,value]of [['本頁尚未送出',mine[key]],['最新正式內容',selected.latest[key]]]){const side=el('div');side.append(el('h4',title),el('p',value||'未填','devotional-comparison-text'));columns.append(side);}section.append(legend,columns);comparison.append(section);}host.append(differences?comparison:el('p','文字欄位目前相同，版本或審核狀態已有更新。'));
   const use=el('button','以最新版重新編輯','secondary');use.type='button';use.dataset.conflictAction='use';use.dataset.appControl='surface';use.disabled=working;use.onclick=()=>void run(true);actions.append(use);
  }
  host.append(actions,status);
 }
 async function run(use){
  if(!current||working||isBusy())return;working=true;setBusy(true);render();const selected=current,epoch=generation;
  try{
   const latest=await loadLatest(selected.item.id,selected.item.devotional_date);if(epoch!==generation||current!==selected)return;
   if(!latest){selected.latest=null;selected.status='正式紀錄目前不存在，尚未替換本頁輸入。請先取回副本，再重新載入清單核對。';return;}
   if(latest.id!==selected.item.id||latest.devotional_date!==selected.item.devotional_date||!Number.isInteger(latest.version)||latest.version<1)throw Error('無法核對最新版本，尚未替換本頁輸入。');
   if(use){if(!selected.latest||selected.latest.version!==latest.version){selected.latest=latest;selected.status='正式內容又有更新，請重新核對後再選擇。';return;}if(!mayLeave()){selected.status='已保留目前輸入，尚未切換最新版。';return;}clear();onUseLatest(latest);}
   else{selected.latest=latest;selected.status='已讀取最新正式內容；本頁輸入尚未變更。要改用最新版時，會先確認是否放棄未儲存修改。';}
  }catch(error){if(epoch===generation){selected.status='目前無法核對最新版，本頁輸入仍保留，請稍後再試。';onError(error);}}
  finally{working=false;setBusy(false);if(epoch===generation){render();(host.querySelector('[data-conflict-action='+ (use?'use':'read') +']')||host.querySelector('button'))?.focus({preventScroll:true});}}
 }
 return{get locked(){return!!current;},show(item){generation++;current={item:structuredClone(item),latest:null,status:'先取回本頁副本或核對最新版，再決定如何繼續。'};render();host.scrollIntoView({block:'start',behavior:'auto'});host.tabIndex=-1;host.focus({preventScroll:true});},clear,render};
}
