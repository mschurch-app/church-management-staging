import {readAccess,canOpen} from './admin-access.mjs?v=20260923-profile1';
export const FIELDS={name:['會友姓名',80],gender:['性別',100],phone:['電話號碼',40],group_name:['所屬小組／小家',100],birthday:['生日（年／月／日）',40],baptism_date:['受洗日期',40],faith_status:['信仰成熟度',100],district:['居住區域',100],growth_progress:['聚會近況',100],ministry:['服事恩賜',2000],memo:['個人牧養備註 / 歷程註記',10000],welcome_status:['迎新跟進狀態',100],know_us_from:['認識教會的管道',300],age_group:['年齡層',100]};
const columns='id,church_id,photo_url,desired_feelings,interest_tags,archived_at,archived_by,'+Object.keys(FIELDS).join(',');
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
export async function listMembers(db,church,search='',page=0,newcomersOnly=false,options={}){
 await authorize(db,church);
 if(typeof newcomersOnly!=='boolean'||typeof search!=='string'||search.length>80||!Number.isInteger(page)||page<0||page>10000)throw new Error('查詢條件不正確。');
 const groupName=typeof options.groupName==='string'?options.groupName.trim():'';
 const sort=options.sort==='name'?'name':'id';
 const archivedOnly=options.archivedOnly===true;
 let q=db.from('members').select(columns).eq('church_id',church).order(sort,{ascending:true}).range(page*25,page*25+25);
 q=archivedOnly?q.not('archived_at','is',null):q.is('archived_at',null);
 if(newcomersOnly)q=q.eq('faith_status','新朋友（初次聚會）');
 if(groupName)q=q.eq('group_name',groupName);
 if(search.trim()){
  const term=search.trim().replace(/[\\%_]/g,'\\$&').replace(/[(),]/g,'');
  q=q.or(['name','phone','memo','group_name'].map(field=>field+'.ilike.%'+term+'%').join(','));
 }
 const {data,error}=await q;
 if(error||!Array.isArray(data))throw new Error('無法載入會員，請稍後重試。');
 await authorize(db,church);
 if(data.some(row=>row.church_id!==church))throw new Error('資料範圍不正確。');
 return {rows:data.slice(0,25),hasNext:data.length>25};
}

export async function setMemberArchived(db,church,row,archived){
 await authorize(db,church);
 if(row?.church_id!==church||!/^[0-9]+$/.test(String(row.id))||typeof archived!=='boolean')throw new Error('會員範圍不正確。');
 const {data:{user}}=await db.auth.getUser();if(!user)throw new Error('登入已失效。');
 const patch={archived_at:archived?new Date().toISOString():null,archived_by:archived?user.id:null};
 let q=db.from('members').update(patch).eq('id',row.id).eq('church_id',church);
 q=row.archived_at==null?q.is('archived_at',null):q.eq('archived_at',row.archived_at);
 const {data,error}=await q.select('id,church_id,archived_at');
 if(error||!Array.isArray(data)||data.length!==1)throw new Error('封存狀態未更新，資料可能已被其他管理員修改。');
 return data[0];
}

export async function listMemberAudit(db,church,limit=50){
 await authorize(db,church);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('日誌筆數不正確。');
 const {data,error}=await db.from('member_audit_log').select('id,member_id,actor_id,action,changed_fields,created_at').eq('church_id',church).order('created_at',{ascending:false}).limit(limit);
 if(error||!Array.isArray(data))throw new Error('無法載入操作日誌。');return data;
}
export async function saveMember(db,church,input,previous=null){
 await authorize(db,church);
 const patch=normalizeMember(input);
 let q;
 if(previous){
  if(previous.church_id!==church||!/^\d+$/.test(String(previous.id)))throw new Error('會員範圍不正確。');
  for(const key of Object.keys(FIELDS))if((input[key]??'')===(previous[key]??''))patch[key]=previous[key]??null;
  q=db.from('members').update(patch).eq('id',previous.id).eq('church_id',church);
  // Optimistic concurrency: do not overwrite any changed editable field.
  for(const key of Object.keys(FIELDS))q=previous[key]==null?q.is(key,null):q.eq(key,previous[key]);
 }else q=db.from('members').insert({...patch,church_id:church});
 const {data,error}=await q.select('id,church_id');
 if(error||!Array.isArray(data)||data.length!==1||data[0].church_id!==church)throw new Error(previous?'未儲存：資料可能已變更或權限已撤銷。請重新載入。':'新增結果未確認。請先查詢名單，避免重複新增。');
 await authorize(db,church);return data[0];
}

export async function listMemberGroups(db,church){
 await authorize(db,church);
 const {data,error}=await db.rpc('get_member_group_names',{p_church:church});
 if(error||!Array.isArray(data))throw Error('無法載入小組／小家選項，請稍後重試。');
 return data.map(x=>x.name);
}
