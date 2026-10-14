export const STEPS=Object.freeze(['information','materials','outline','manuscript','slides']);
export const JOB_KINDS=Object.freeze(['search','detail','guide','outline','manuscript','slides','backup','media']);
export function guideOptions(previous=null,selections=[]){
  if(previous===null)return {round:1,history:[]};
  if(!previous||!Number.isInteger(previous.round)||previous.round<1||previous.round>3||!Array.isArray(previous.history)||previous.history.length!==previous.round-1||typeof previous.question!=='string'||!previous.question.trim()||previous.question.length>300||!Array.isArray(previous.choices)||previous.choices.length!==4||previous.choices.some(value=>typeof value!=='string'||!value.trim()||value.length>100))throw Error('invalid_guide');
  if(!Array.isArray(selections)||selections.length<1||selections.length>4||selections.some(value=>!Number.isInteger(value)||value<0||value>3)||new Set(selections).size!==selections.length)throw Error('invalid_guide');
  const history=[...previous.history,{question:previous.question,selected:selections.map(index=>previous.choices[index])}];
  if(history.some(turn=>!turn||typeof turn.question!=='string'||turn.question.length>300||!Array.isArray(turn.selected)||turn.selected.length<1||turn.selected.length>4||turn.selected.some(value=>typeof value!=='string'||value.length>100)))throw Error('invalid_guide');
  return {round:history.length+1,history};
}
export const characterCount=text=>[...String(text||'').split(/\n#{1,6}\s*(?:來源|待查證)/)[0].replace(/^#{1,6}\s.*$/gm,'').replace(/\[素材\s*\d+\]/g,'').replace(/\s/g,'')].length;
export const emptyDraft=(information={title:'',speaker:'',scripture:'',service_date:''})=>({format:'mplus-sermon-workspace',information,step:'information',notes:'',audience:'',bible_version:'',target_characters:5000,materials:[],outline:[],outline_confirmed:false,manuscript:'',source_checklist:[],slides:[]});
export function validateDraft(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.format!=='mplus-sermon-workspace'||!STEPS.includes(value.step))throw Error('invalid_draft');
  const allowed=new Set(Object.keys(emptyDraft()));if(Object.keys(value).some(k=>!allowed.has(k)))throw Error('invalid_draft');
  if(!value.information||Object.keys(value.information).sort().join(',')!=='scripture,service_date,speaker,title')throw Error('invalid_draft');
  for(const [k,max] of [['title',200],['speaker',80],['scripture',200],['service_date',10]])if(typeof value.information[k]!=='string'||value.information[k].length>max||(k!=='service_date'&&!value.information[k].trim()))throw Error('invalid_draft');
  if(value.information.service_date&&!/^\d{4}-\d{2}-\d{2}$/.test(value.information.service_date))throw Error('invalid_draft');
  for(const [key,max] of [['notes',20000],['audience',200],['bible_version',100],['manuscript',150000]])if(typeof value[key]!=='string'||value[key].length>max)throw Error('invalid_draft');
  if(![5000,6000,8000].includes(value.target_characters)||typeof value.outline_confirmed!=='boolean')throw Error('invalid_draft');
  if(!Array.isArray(value.outline)||value.outline.length>12||value.outline.some(x=>typeof x!=='string'||!x.trim()||x.length>3000))throw Error('invalid_outline');
  if(value.outline_confirmed&&value.outline.length<3)throw Error('outline_required');
  if(!Array.isArray(value.materials)||value.materials.length>24)throw Error('invalid_materials');
  const seen=new Set();
  for(const m of value.materials){
    if(!m||!['archive','personal','transcript'].includes(m.kind)||typeof m.id!=='string'||seen.has(m.id)||(!m.id||m.id.length>120)||typeof m.content!=='string'||m.content.length>6000||typeof m.note!=='string'||m.note.length>3000||typeof m.reviewed!=='boolean')throw Error('invalid_materials');
    seen.add(m.id);
    if(m.url&&(!/^https?:\/\//.test(m.url)||m.url.length>2000))throw Error('invalid_materials');
    if(m.kind==='archive'&&(!/^https?:\/\//.test(m.url||'')||m.url.length>2000||!Number.isSafeInteger(m.ordinal)||m.ordinal<0||!/^[a-f0-9]{64}$/.test(m.content_sha||'')))throw Error('invalid_materials');
    if(m.kind==='transcript'&&(!/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(m.url||'')||!/^[a-f0-9]{64}$/.test(m.content_sha||'')||!/^([a-f0-9]{8}-[a-f0-9-]{27})$/i.test(m.job_id||'')||!Number.isFinite(m.start)||!Number.isFinite(m.end)||m.start<0||m.end<=m.start))throw Error('invalid_materials');
    for(const k of ['title','speaker'])if(typeof m[k]!=='string'||m[k].length>500)throw Error('invalid_materials');
  }
  if(!Array.isArray(value.slides)||value.slides.length>20||value.slides.some(s=>!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>200||typeof s.content!=='string'||s.content.length>2000||typeof s.notes!=='string'||s.notes.length>5000))throw Error('invalid_slides');
  if(!Array.isArray(value.source_checklist)||value.source_checklist.length>60||value.source_checklist.some(s=>typeof s!=='string'||s.length>2000))throw Error('invalid_draft');
  return value;
}
export function generationReady(draft,kind){
  validateDraft(draft);
  if(!['outline','manuscript','slides'].includes(kind))return;
  if(draft.materials.some(m=>!m.reviewed))throw Error('materials_need_review');
  if(kind==='manuscript'&&(!draft.outline_confirmed||draft.outline.length<3))throw Error('outline_required');
  if(kind==='slides'&&characterCount(draft.manuscript)<draft.target_characters)throw Error('manuscript_too_short');
}
export function applyGenerated(draft,kind,result){
  const next=structuredClone(draft);
  if(kind==='outline'){next.outline=result.outline;next.outline_confirmed=false;next.step='outline';}
  if(kind==='manuscript'){next.manuscript=result.manuscript;next.step='manuscript';next.slides=[];}
  if(kind==='slides'){next.slides=result.slides;next.step='slides';}
  if(result.source_checklist)next.source_checklist=result.source_checklist;
  return validateDraft(next);
}


export function videoUrl(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error();const id=['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&u.pathname==='/watch'?u.searchParams.get('v'):u.hostname==='youtu.be'&&u.pathname.split('/').length===2?u.pathname.slice(1):'';if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw Error();return 'https://www.youtube.com/watch?v='+id;}catch{throw Error('invalid_request');}
}
