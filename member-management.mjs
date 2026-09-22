import {readAccess,canOpen} from './admin-access.mjs';
export const FIELDS={name:['姓名',80],phone:['電話',40],district:['地區',100],birthday:['生日',40],gender:['性別',100],memo:['備註',10000],faith_status:['信仰／聚會狀態',100],welcome_status:['迎新跟進狀態',100],know_us_from:['認識教會的管道',300],age_group:['年齡層',100]};
const columns='id,church_id,photo_url,desired_feelings,interest_tags,'+Object.keys(FIELDS).join(',');
export function normalizeMember(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(FIELDS,k)))throw new Error('資料欄位不正確。');
 const result={};
 for(const [key,[label,max]] of Object.entries(FIELDS)){
  const value=input[key]??'';
  if(typeof value!=='string'||value.length>max)throw new Error(label+'長度不正確。');
  result[key]=value.trim();
 }
 if(!result.name)throw new Error('請填寫姓名。');
 if(/^\d{4}-\d{2}-\d{2}$/.test(result.birthday)&&(!Number.isFinite(Date.parse(result.birthday))||new Date(result.birthday).toISOString().slice(0,10)!==result.birthday))throw new Error('生日日期不正確。');
 result.birthday=result.birthday||null;return result;
}
async function authorize(db,church){
 if(!['M+','SHiNE'].includes(church)||!canOpen(await readAccess(db),church,'members'))throw new Error('沒有此堂會的會員管理權限。');
}
export async function listMembers(db,church,search='',page=0,newcomersOnly=false){
 await authorize(db,church);
 if(typeof newcomersOnly!=='boolean'||typeof search!=='string'||search.length>80||!Number.isInteger(page)||page<0||page>10000)throw new Error('查詢條件不正確。');
 let q=db.from('members').select(columns).eq('church_id',church).order('id',{ascending:true}).range(page*25,page*25+25);
 if(newcomersOnly)q=q.eq('faith_status','新朋友（初次聚會）');
 if(search.trim())q=q.ilike('name','%'+search.trim().replace(/[\\%_]/g,'\\$&')+'%');
 const {data,error}=await q;
 if(error||!Array.isArray(data))throw new Error('無法載入會員，請稍後重試。');
 await authorize(db,church);
 if(data.some(row=>row.church_id!==church))throw new Error('資料範圍不正確。');
 return {rows:data.slice(0,25),hasNext:data.length>25};
}
export async function saveMember(db,church,input,previous=null){
 await authorize(db,church);
 const patch=normalizeMember(input);
 let q;
 if(previous){
  if(previous.church_id!==church||!/^\d+$/.test(String(previous.id)))throw new Error('會員範圍不正確。');
  q=db.from('members').update(patch).eq('id',previous.id).eq('church_id',church);
  // Optimistic concurrency: do not overwrite any changed editable field.
  for(const key of Object.keys(FIELDS))q=previous[key]==null?q.is(key,null):q.eq(key,previous[key]);
 }else q=db.from('members').insert({...patch,church_id:church});
 const {data,error}=await q.select('id,church_id');
 if(error||!Array.isArray(data)||data.length!==1||data[0].church_id!==church)throw new Error(previous?'未儲存：資料可能已變更或權限已撤銷。請重新載入。':'新增結果未確認。請先查詢名單，避免重複新增。');
 await authorize(db,church);return data[0];
}
