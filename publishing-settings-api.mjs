import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261022-experience5';
import {invalidResult} from './settings-workflow.mjs?v=20261023-settings1';
export {db,invalidResult};
export const church=new URLSearchParams(location.search).get('church')||'M+';
export async function authorizePublishing(){
  if(!['M+','SHiNE'].includes(church))throw Error('堂會設定不正確。');
  const access=await readAccess(db);
  if(!canOpen(access,church,'website_weekly')||!canAction(access,church,'website_weekly','approve'))throw Error('只有牧師、師母或週報核准人員可以管理發布設定。');
}
export async function publishingApi(endpoint,action,payload={}){
  const {data,error}=await db.auth.getSession(),token=data?.session?.access_token;
  if(error||!token)throw Error('登入已失效，請重新登入教會 OS。');
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/'+endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action,church,...payload}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(18000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok){
    // A server error after a write can happen after the settings were saved.
    if(response.status>=500&&!['get','status'].includes(action))throw invalidResult();
    const messages={invalid_token:'這組權杖無法驗證，請重新產生後再貼上。',forbidden:'目前帳號沒有管理此設定的權限。',login_required:'登入已失效，請重新登入教會 OS。'};
    const failure=Error(messages[result?.error]||'暫時無法取得結果，請重新載入。');failure.status=response.status;throw failure;
  }
  if(result?.ok!==true)throw invalidResult();
  return result;
}
export function checkedConnection(result,kind){
  if(!Object.hasOwn(result,'connection'))throw invalidResult();
  const value=result.connection;
  if(value!==null&&(!value||typeof value.status!=='string'||(value.status==='connected'&&typeof value[kind==='instagram'?'username':'channel_id']!=='string')))throw invalidResult();
  return value;
}
