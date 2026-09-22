import {readAccess,canOpen} from './admin-access.mjs';
async function authorize(db,church){
  if(!['M+','SHiNE'].includes(church)||!canOpen(await readAccess(db),church,'members'))throw new Error('沒有這間教會的會員管理權限。');
}
export async function loadRequests(db,church){
  await authorize(db,church);
  const {data,error}=await db.rpc('list_binding_requests',{p_church:church});
  if(error||!Array.isArray(data))throw new Error('無法載入綁定申請。');
  await authorize(db,church);
  return data;
}
export async function findCandidates(db,church,name){
  await authorize(db,church);
  if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('請輸入完整會員姓名。');
  const {data,error}=await db.from('members').select('id,name,phone,church_id').eq('church_id',church).eq('name',name.trim()).limit(30);
  if(error||!Array.isArray(data))throw new Error('無法查詢會員。');
  await authorize(db,church);
  return data.filter(row=>row.church_id===church);
}
export async function reviewRequest(db,church,id,action,member=null){
  await authorize(db,church);
  if(!['approve','reject','revoke'].includes(action))throw new Error('無效操作。');
  if(typeof member==='number'&&!Number.isSafeInteger(member))throw new Error('無效會員編號。');
  if(action==='approve'&&(!/^[1-9]\d{0,18}$/.test(String(member))||BigInt(member)>9223372036854775807n))throw new Error('請先選擇會員。');
  if(action!=='approve'&&member!==null)throw new Error('無效操作。');
  const {data,error}=await db.rpc('review_member_binding',{p_id:id,p_action:action,p_member:member});
  if(error||data!==true)throw new Error('未完成變更；請重新載入，確認權限、申請狀態與會員綁定。');
}
