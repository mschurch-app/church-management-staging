import {readAccess,canOpen} from './admin-access.mjs?v=20261009-stage1';
async function authorize(db,church){
  if(!['M+','SHiNE'].includes(church)||!canOpen(await readAccess(db),church,'binding_review'))throw new Error('沒有這間教會的會友管理權限。');
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
  if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('請輸入會友姓名。');
  const term=name.trim().replace(/[\\%_]/g,'\\$&');
  const {data,error}=await db.from('members').select('id,name,phone,church_id').eq('church_id',church).is('archived_at',null).ilike('name','%'+term+'%').order('name').limit(30);
  if(error||!Array.isArray(data))throw new Error('無法查詢會友。');
  await authorize(db,church);
  return data.filter(row=>row.church_id===church);
}
export async function reviewRequest(db,church,id,action,member=null){
  await authorize(db,church);
  if(!['approve','reject','revoke'].includes(action))throw new Error('無效操作。');
  if(typeof member==='number'&&!Number.isSafeInteger(member))throw new Error('無效會友編號。');
  if(action==='approve'&&(!/^[1-9]\d{0,18}$/.test(String(member))||BigInt(member)>9223372036854775807n))throw new Error('請先選擇會友。');
  if(action!=='approve'&&member!==null)throw new Error('無效操作。');
  const {data,error}=await db.rpc('review_member_binding',{p_id:id,p_action:action,p_member:member});
  if(error||data!==true)throw new Error('未完成變更；請重新載入，確認權限、申請狀態與會友綁定。');
}
