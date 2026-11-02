export const FIELDS = Object.freeze([
 ['devotional_title','靈修標題',300],['selected_scripture_reference','金句出處',300],
 ['golden_verse_text','金句全文',5000],['knowledge_point','知識點',5000],
 ['explanation','釋經',5000],['life_application','生活應用',5000],['blessing','祝福禱告',5000]
]);
export const valuesOf = document => Object.fromEntries(FIELDS.map(([key])=>[key,String(document?.[key]||'').trim()]));
export const bodyCount = values => [...['knowledge_point','explanation','life_application','blessing'].map(k=>values[k]||'').join('').replace(/[^\p{L}\p{N}]/gu,'')].length;
export const sameValues = (a,b) => FIELDS.every(([k])=>String(a?.[k]||'').trim()===String(b?.[k]||'').trim());
export function validation(values){
 for(const [key,label,max] of FIELDS)if(!values[key]?.trim())return `請填寫${label}。`;else if([...values[key]].length>max)return `${label}超過 ${max} 字。`;
 return bodyCount(values)<350?'知識點、釋經、生活應用與祝福合計至少 350 字（不含標點）。':'';
}
export function filterDays(items,month='',query=''){
 const q=query.trim().toLocaleLowerCase();
 return items.filter(i=>(!month||i.date.slice(5,7)===month)&&(!q||`${i.day} ${i.date} ${i.title} ${i.main_reference} ${i.support_reference}`.toLocaleLowerCase().includes(q)));
}
export function reconcileSave(current,pending){
 if(current.day_number!==pending.day)return 'unknown';
 if(sameValues(current.document,pending.values))return 'saved';
 return current.revision===pending.expected_revision?'not_saved':'conflict';
}
