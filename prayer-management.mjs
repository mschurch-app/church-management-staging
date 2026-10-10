import {readAccess,canOpen} from './admin-access.mjs?v=20261009-stage1';

async function authorize(db,church){
  if(!['M+','SHiNE'].includes(church)||!canOpen(await readAccess(db),church,'prayers'))throw new Error('沒有此堂會的代禱管理權限。');
}

export async function listPrayers(db,church){
  await authorize(db,church);
  const {data,error}=await db.from('prayers')
    .select('id,church_id,author_name,group_name,title,content,category,hands_count,is_answered,is_private,status,pastoral_notes,created_at,expires_at')
    .eq('church_id',church).order('created_at',{ascending:false}).limit(200);
  if(error||!Array.isArray(data))throw new Error('無法載入代禱與關懷資料。');
  await authorize(db,church);
  return data;
}

export async function savePrayerCare(db,church,row,input){
  await authorize(db,church);
  const status=String(input.status||''),notes=String(input.pastoral_notes||'').trim(),category=String(input.category||'').trim().slice(0,100);
  if(row?.church_id!==church||!/^[0-9]+$/.test(String(row.id)))throw new Error('代禱資料範圍不正確。');
  if(!['pending','praying','answered','closed'].includes(status))throw new Error('關懷狀態不正確。');
  if(notes.length>10000)throw new Error('教牧備註不可超過 10,000 字。');
  const title=String(input.title??row.title??'').trim(),content=String(input.content??row.content??'').trim();
  if((title!==String(row.title||'').trim()&&(!title||title.length>80))||(content!==String(row.content||'').trim()&&(!content||content.length>1000)))throw new Error('請填寫代禱主題（80 字以內）與內容（1,000 字以內）。');
  let query=db.from('prayers').update({status,category,pastoral_notes:notes,is_answered:status==='answered',title,content})
    .eq('id',row.id).eq('church_id',church);
  query=query.eq('title',row.title).eq('content',row.content);
  query=row.is_private===null?query.is('is_private',null):query.eq('is_private',row.is_private);
  query=row.status===null?query.is('status',null):query.eq('status',row.status);
  query=row.pastoral_notes===null?query.is('pastoral_notes',null):query.eq('pastoral_notes',row.pastoral_notes);
  const {data,error}=await query.select('id');
  if(error||!Array.isArray(data)||data.length!==1)throw new Error('關懷紀錄未儲存，資料可能已被其他同工更新，請重新載入。');
  return data[0];
}

export async function createCarePrayer(db,church,input,requestId){
  await authorize(db,church);
  const payload={};
  for(const [key,max] of [['author_name',60],['title',80],['content',1000],['group_name',100],['category',100]]){
    payload[key]=String(input[key]||'').trim();
    if(payload[key].length>max||(['author_name','title','content'].includes(key)&&!payload[key]))throw new Error('請完整填寫稱呼、代禱主題與內容，並確認字數限制。');
  }
  if(typeof input.is_private!=='boolean')throw new Error('請選擇代禱公開範圍。');
  payload.is_private=input.is_private;
  const {data,error}=await db.rpc('create_care_prayer',{p_church:church,p_input:payload,p_request_id:requestId});
  if(error||!data?.id)throw new Error(error?.message==='request_conflict'?'這筆代禱已儲存，請重新載入後修改。':'代禱尚未確認儲存，請保留內容並重試。');
  return data;
}
