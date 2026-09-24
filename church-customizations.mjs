export const FEATURE_FILES={members:'members.html',groups:'groups.html',attendance:'attendance.html',schedules:'schedules.html',prayers:'prayers.html',spaces:'spaces.html',pastoral_inbox:'pastoral-inbox.html',pastoral_content:'pastoral-content.html'};

const cleanText=(value,max=100)=>String(value??'').trim().slice(0,max);
const uniqueStrings=(values,max=50)=>[...new Set((Array.isArray(values)?values:[]).map(value=>cleanText(value,80)).filter(Boolean))].slice(0,max);

export async function loadChurchCustomizations(db,church){
  if(!['M+','SHiNE'].includes(church))throw new Error('堂會範圍不正確。');
  const {data,error}=await db.from('church_customizations').select('church_id,feature_modules,welcome_fields,catalogs,version,updated_at').eq('church_id',church).maybeSingle();
  if(error||!data||!Array.isArray(data.feature_modules)||!Array.isArray(data.welcome_fields)||!data.catalogs)throw new Error('無法載入堂會功能設定。');
  return data;
}

export async function saveChurchCustomizations(db,church,draft,previous){
  if(previous?.church_id!==church)throw new Error('設定資料範圍不正確。');
  const moduleKeys=new Set(),fieldKeys=new Set();
  const feature_modules=(draft.feature_modules||[]).map((item,index)=>{
    const key=cleanText(item.key,40);if(!FEATURE_FILES[key]||moduleKeys.has(key))throw new Error('功能設定含有重複或未知項目。');moduleKeys.add(key);
    return{key,permission:cleanText(item.permission,40),label:cleanText(item.label,30),icon:cleanText(item.icon,12),description:cleanText(item.description,100),enabled:Boolean(item.enabled),dashboard:Boolean(item.dashboard),navigation:Boolean(item.navigation),dashboard_order:(index+1)*10,navigation_order:(index+1)*10};
  });
  const welcome_fields=(draft.welcome_fields||[]).map((item,index)=>{
    const key=cleanText(item.key,40);if(!key||fieldKeys.has(key))throw new Error('表單欄位設定重複。');fieldKeys.add(key);
    return{key,label:cleanText(item.label,80),visible:Boolean(item.visible),required:Boolean(item.required)&&Boolean(item.visible),sort_order:(index+1)*10,audience:['all','newcomer','member'].includes(item.audience)?item.audience:'all'};
  });
  if(feature_modules.some(item=>!item.label||!item.icon)||welcome_fields.some(item=>!item.label))throw new Error('名稱與圖示不可留白。');
  const catalogs={};for(const [key,values] of Object.entries(draft.catalogs||{})){const clean=uniqueStrings(values);if(!clean.length)throw new Error('每組選項至少保留一項。');catalogs[key]=clean;}
  const payload={feature_modules,welcome_fields,catalogs,version:Number(previous.version)+1,updated_at:new Date().toISOString()};
  const {data,error}=await db.from('church_customizations').update(payload).eq('church_id',church).eq('version',previous.version).select('church_id,feature_modules,welcome_fields,catalogs,version,updated_at');
  if(error||!Array.isArray(data)||data.length!==1)throw new Error('設定未儲存，可能已有其他管理員更新，請重新載入。');
  return data[0];
}

export function featureSettings(settings,place){
  return [...(settings?.feature_modules||[])].filter(item=>item.enabled&&item[place]).sort((a,b)=>Number(a[place+'_order']||0)-Number(b[place+'_order']||0));
}

export function catalog(settings,key,fallback=[]){const values=settings?.catalogs?.[key];return uniqueStrings(Array.isArray(values)&&values.length?values:fallback);}

export function makeDragSorter(container,onChange){
  let active=null;
  const rows=()=>[...container.querySelectorAll('[data-sort-row]')];
  const finish=()=>{if(!active)return;active.classList.remove('is-dragging');active=null;onChange(rows().map(row=>row.dataset.sortKey));};
  container.addEventListener('dragstart',event=>{const row=event.target.closest('[data-sort-row]');if(!row)return;active=row;row.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';});
  container.addEventListener('dragover',event=>{if(!active)return;event.preventDefault();const target=event.target.closest('[data-sort-row]');if(!target||target===active)return;const box=target.getBoundingClientRect();container.insertBefore(active,event.clientY<box.top+box.height/2?target:target.nextSibling);});
  container.addEventListener('dragend',finish);
  container.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-drag-handle]'))return;active=event.target.closest('[data-sort-row]');active?.classList.add('is-dragging');event.target.setPointerCapture?.(event.pointerId);});
  container.addEventListener('pointermove',event=>{if(!active||event.pointerType==='mouse'&&!event.buttons)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-sort-row]');if(!target||target===active||target.parentElement!==container)return;const box=target.getBoundingClientRect();container.insertBefore(active,event.clientY<box.top+box.height/2?target:target.nextSibling);});
  container.addEventListener('pointerup',finish);container.addEventListener('pointercancel',finish);
}
