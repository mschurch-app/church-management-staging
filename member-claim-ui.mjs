import {onboardingCredentials} from './member-onboarding.mjs?v=20261110-line-claim1';
const endpoint='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/member-access';
// Each candidate is opaque, short-lived and scoped to a server-verified LINE identity.
export function mountMemberClaim({church,nameInput,onPrefill=()=>()=>{}}){
 const box=document.createElement('section');box.id='memberClaimLookup';box.dataset.actionFeedback='off';box.className='mt-3 space-y-3 rounded-2xl bg-stone-50 p-4';
 const message=document.createElement('p');message.setAttribute('role','status');message.className='text-sm text-stone-700';
 const controls=document.createElement('div');controls.className='space-y-2';box.append(message,controls);nameInput.after(box);
 let state='new',candidate,claimToken,version=0,timer,pendingLookup,undo=()=>{},frozenName='',lastQuery='';
 const label=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const say=text=>{message.textContent=text;controls.replaceChildren();};
 const button=(text,fn)=>{const b=label('button',text);b.type='button';b.className='w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-bold';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;b.setAttribute('aria-busy','true');try{await fn();}catch{state='error';say('暫時無法核對，請重新查詢；已填內容仍保留。');controls.append(button('重新查詢姓名',()=>search()));}finally{b.disabled=false;b.removeAttribute('aria-busy');}};return b;};
 async function call(action,extra={}){
  const auth=await onboardingCredentials(church);if(!Object.values(auth).some(Boolean))throw Error('login_required');
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({action,church,...auth,...extra})});
  if(!r.ok)throw Error('claim_unavailable');return r.json();
 }
 function reset(){undo();undo=()=>{};nameInput.readOnly=false;claimToken=undefined;candidate=undefined;frozenName='';}
 function review(){state='review';nameInput.readOnly=true;frozenName=nameInput.value.trim();say('目前無法自助核對這筆資料。請填完下方表單，送出後由同工確認；確認前不會帶出舊資料或開通會友功能。');controls.append(button('不是我，重新查詢',()=>{reset();return search();}));}
 function outcome(result){
  if(result.state==='review_required'){review();return;}
  if(result.state==='limited'){state='limited';say('今天的核對次數已達上限，請聯絡教會同工協助。');return;}
  if(result.state==='expired'){state='expired';say('核對已逾時，請重新查詢姓名；已填內容仍保留。');controls.append(button('重新查詢姓名',()=>{reset();return search();}));return;}
  throw Error('claim_unavailable');
 }
 async function select(value,ticket){
  if(ticket!==version)return;
  candidate=value.token;nameInput.value=value.name;lastQuery=value.name;frozenName=value.name;nameInput.readOnly=true;state='checking';say('正在確認可以核對的欄位…');
  const r=await call('claim_select',{candidate});if(ticket!==version)return;
  if(r.state!=='challenge'){outcome(r);return;}
  state='challenge';const phone=r.method==='phone';say(phone?'請輸入名冊上的完整手機號碼。':'名冊沒有可用手機，請輸入完整出生日期核對。');
  const field=document.createElement('input');field.id='memberClaimAnswer';field.type=phone?'tel':'date';field.autocomplete='off';field.maxLength=40;field.className='w-full rounded-xl border border-stone-200 p-3 text-sm';field.setAttribute('aria-label',phone?'核對手機號碼':'核對生日');
  const feedback=label('p','');feedback.setAttribute('role','status');feedback.className='text-sm text-stone-700';
  const verify=button('核對本人資料',async()=>{
   if(!field.value.trim()){feedback.textContent='請先填寫核對資料。';return;}
   state='verifying';const result=await call('claim_verify',{candidate,answer:field.value});if(ticket!==version)return;
   if(result.state==='mismatch'){state='challenge';field.value='';feedback.textContent='資料不相符，請確認後再試；若仍無法核對，請聯絡同工。';return;}
   if(result.state!=='verified'){outcome(result);return;}
   state='verified';claimToken=result.claimToken;undo=onPrefill(result.member)||(()=>{});say('身分核對通過。請補齊表單空白資料，送出後才會完成 LINE 綁定；既有資料會保留。');controls.append(button('不是我，重新查詢',()=>{reset();return search();}));
  });controls.append(field,feedback,verify,button('不是我，重新查詢',()=>{reset();return search();}));
 }
 async function search(){
  clearTimeout(timer);const ticket=++version,query=nameInput.value.trim();lastQuery=query;claimToken=undefined;candidate=undefined;
  if(!query){state='new';say('輸入姓名時，會逐步查找既有會友資料。');return;}
  state='searching';say('正在查詢姓名…');
  try{
   const auth=await onboardingCredentials(church);if(ticket!==version)return;
   // Anonymous public form remains usable; existing roster lookup always requires verified login.
   if(!Object.values(auth).some(Boolean)){state='new';say('登入 LINE 後可以查找既有會友資料。');return;}
   const r=await call('lookup',{query});if(ticket!==version)return;
   if(r.state!=='candidates'){outcome(r);return;}
   if(!r.candidates.length){state='new';say('目前沒有符合的姓名，可以繼續填寫新朋友資料。');return;}
   state='candidates';say(r.candidates.length===8?'找到以下姓名；請繼續輸入完整姓名縮小範圍，再確認哪一位是你。':'請確認以下是否有你本人；確認後還需要核對身分。');
   for(const value of r.candidates){controls.append(button('這是我：'+value.name,async()=>{if(ticket!==version)return;say('請確認這個姓名是你本人。');controls.append(button('是，我是 '+value.name,()=>select(value,ticket)),button('不是，返回姓名查詢',()=>search()));}));}
   controls.append(button('以上都不是我，填寫新朋友資料',()=>{if(ticket!==version)return;state='new';say('請繼續填寫新朋友資料。');}));
  }catch{if(ticket!==version)return;state='error';say('姓名查詢暫時未完成，請重新查詢，避免重複建檔。');controls.append(button('重新查詢姓名',()=>search()));}
 }
 nameInput.addEventListener('input',()=>{if(nameInput.readOnly)return;reset();version++;state='searching';say('正在查詢姓名…');clearTimeout(timer);timer=setTimeout(()=>{pendingLookup=search();},350);});
 say('輸入姓名時，會逐步查找既有會友資料。');
 return {
  async beforeSubmit(){
   if(nameInput.value.trim()!==lastQuery&&!nameInput.readOnly){clearTimeout(timer);pendingLookup=search();}
   if(timer){clearTimeout(timer);timer=undefined;if(state==='searching')pendingLookup=search();}
   if(pendingLookup)await pendingLookup;
   if(['verified','review'].includes(state)&&nameInput.value.trim()!==frozenName)throw Error('姓名已變更，請重新核對。');
   if(state==='verified')return {claimToken};
   if(state==='review'&&candidate)return {claimToken:candidate,claimReview:true};
   if(state==='new')return {};
   throw Error(state==='candidates'?'請先確認候選姓名是否是你本人，或選擇「以上都不是我」。':'請先完成身分核對，或聯絡教會同工協助。');
  },
  resetProof(){reset();lastQuery='';state='expired';say('核對已逾時或資料已更新，請重新核對；表單內容仍保留。');controls.append(button('重新查詢姓名',()=>search()));}
 };
}
