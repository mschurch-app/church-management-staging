import {wireLineAuth,pendingHandoff} from './app-line-auth.mjs?v=20261022-coworker2';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
import {APPLICATION_PAGE,applicationRPC} from './coworker-application-api.mjs?v=20261022-coworker2';
const $=s=>document.querySelector(s),form=$('#application-form'),status=$('#status'),line=$('#line-login');
const bounded=(request)=>Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('登入確認逾時，請重試。')),15000))]);
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{fetch:(input,options={})=>fetch(input,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})},auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:localStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'implicit'}});
let saved=null,busy=false,verifiedUser='';
const field=key=>form.elements.namedItem(key);
function fill(row={}){for(const key of ['full_name','ministry','mobile','applicant_note'])field(key).value=row[key]||'';field('church_id').value=row.church_id||'M+';}
function show(row){
 saved=row;form.hidden=true;$('#edit-application').hidden=true;$('#enter-workspace').hidden=true;
 $('#review-note').textContent=row?.review_note?'審核說明：'+row.review_note:'';
 if(['approved','already_authorized'].includes(row?.status)){status.textContent='同工權限已核准，請進入工作台。';$('#enter-workspace').hidden=false;return;}
 if(row?.status==='account_unavailable'){status.textContent='此帳號曾經核准，目前尚無可用權限，請聯絡管理員確認。';return;}
 if(row?.status==='pending'){status.textContent='申請已送出，等待管理員確認身分與權限。可隨時回到這裡查看進度。';$('#edit-application').hidden=false;return;}
 if(row?.status==='rejected')status.textContent='申請需要補充或修正資料，修改後可重新送出。';
 else status.textContent='LINE 身分已確認，請填寫以下申請資料。';
 fill(row||{});form.hidden=false;
}
$('#edit-application').onclick=()=>{fill(saved);form.hidden=false;$('#edit-application').hidden=true;status.textContent='修改後請重新送出；管理員會審核最新資料。';};
$('#refresh-application').onclick=()=>void start();
form.onsubmit=async event=>{
 event.preventDefault();if(busy||!form.reportValidity())return;
 if(!verifiedUser){status.textContent='請先使用 LINE 驗證身分。';return;}
 busy=true;const button=$('#submit-application');button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='正在送出申請，請稍候…';
 try{
  const values=Object.fromEntries(new FormData(form));
  const row=await applicationRPC(db,'submit_coworker_application',{p_full_name:values.full_name.trim(),p_church:values.church_id,p_ministry:values.ministry.trim(),p_mobile:values.mobile.trim(),p_note:values.applicant_note.trim(),p_expected_version:saved?.updated_at||null});
  if(!row||!['pending','approved','already_authorized'].includes(row.status))throw Error('申請尚未確認送出，請保留資料並重試。');
  show(row);
 }catch(error){status.textContent=error.message;}
 finally{busy=false;button.disabled=false;button.removeAttribute('aria-busy');}
};
let authWired=false;
async function start(){
 if(busy)return;busy=true;$('#refresh-application').disabled=true;
 try{
  if(pendingHandoff()){status.textContent='正在接續 LINE 驗證…';}
  const session=await bounded(db.auth.getSession());
  if(!session.data?.session){form.hidden=true;line.hidden=false;status.textContent='先使用 LINE 驗證身分，再填寫申請。';if(!authWired){wireLineAuth(db,line,status,{next:APPLICATION_PAGE,onResume:()=>void start()});authWired=true;}return;}
  const verified=await bounded(db.auth.getUser());
  if(verified.error||!verified.data?.user)throw Error('登入狀態已失效，請回登入頁使用 LINE 重新登入。');
  if(!verified.data.user.identities?.some(i=>i.provider==='custom:line-web')){
   form.hidden=true;line.hidden=false;status.textContent='請綁定 LINE 後申請，既有帳號資料會保留。';
   if(!authWired){wireLineAuth(db,line,status,{flow:'link',next:APPLICATION_PAGE,onResume:()=>void start()});authWired=true;}return;
  }
  verifiedUser=verified.data.user.id;line.hidden=true;status.textContent='正在查詢申請進度…';
  const row=await applicationRPC(db,'get_my_coworker_application');show(row);
 }catch(error){status.textContent=error.message;}
 finally{busy=false;$('#refresh-application').disabled=false;}
}
void start();
