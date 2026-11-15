export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function permalink(id){if(!UUID.test(id))throw Error('invalid_story');return `https://mchurch.online/?testimony=${id}#testimonies`;}
const clean=s=>String(s||'').replace(/\r\n?/g,'\n').trim();
export function buildCarousel(story){
 const p=story.payload||story,body=clean(p.body),sentences=body.match(/[^。！？\n]+[。！？]?/gu)||[];
 const candidates=sentences.map((text,index)=>({text:text.trim(),index,score:(/神|耶穌|信仰|恩典|感恩|盼望|改變|學習|教會|禱告/.test(text)?3:0)+(/但|然而|後來|開始|如今|現在|原來|願意/.test(text)?2:0)})).filter(x=>x.text.length>8);
 const count=Math.min(5,Math.max(2,Math.ceil(body.length/350))),chosen=candidates.length<=count?candidates:[...candidates.slice(0,1),...candidates.slice(1,-1).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,count-2),...candidates.slice(-1)].sort((a,b)=>a.index-b.index);
 const slides=chosen.flatMap(x=>{const text=x.text;return Array.from({length:Math.ceil(text.length/140)},(_,i)=>({heading:'生命的故事',text:text.slice(i*140,(i+1)*140)}));}).slice(0,6);
 return {version:1,title:clean(p.title),display_name:clean(p.display_name)||'匿名分享',cover_slot:p.media?.find(m=>m.kind==='photo'&&['image/jpeg','image/png','image/webp'].includes(m.type))?.slot??null,cover_illustration:p.media?.some(m=>m.kind==='photo'&&['image/jpeg','image/png','image/webp'].includes(m.type))?null:(/幽谷|風暴|苦難|創傷/.test(body)?'light-in-valley-v1':'quiet-prayer-v1'),slides:slides.length?slides:[{heading:'雲彩見證',text:body.slice(0,140)}],caption:`${clean(p.title)}\n${clean(p.display_name)||'匿名分享'}｜雲彩見證\n\n${(chosen[0]?.text||body).slice(0,200)}\n\n閱讀完整見證：\n${permalink(story.id)}\n\n#Mplus大雅教會 #雲彩見證 #生命故事`,url:permalink(story.id)};
}
export function validatePlan(plan,id){
 if(!plan||plan.version!==1||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>60||typeof plan.display_name!=='string'||plan.display_name.length>40||plan.url!==permalink(id)||!Array.isArray(plan.slides)||plan.slides.length<1||plan.slides.length>6)throw Error('invalid_plan');
 for(const s of plan.slides)if(typeof s.heading!=='string'||!s.heading.trim()||s.heading.length>24||typeof s.text!=='string'||!s.text.trim()||s.text.length>160)throw Error('invalid_plan');
 if(typeof plan.caption!=='string'||plan.caption.length>2200||!plan.caption.includes(permalink(id)))throw Error('link_required');
 if(plan.cover_slot!==null&&(!Number.isInteger(plan.cover_slot)||plan.cover_slot<0||plan.cover_slot>8))throw Error('invalid_plan');
 if(plan.cover_illustration&&!['light-in-valley-v1','quiet-prayer-v1'].includes(plan.cover_illustration))throw Error('invalid_plan');
 return structuredClone(plan);
}
export function jpegSize(bytes){
 if(bytes[0]!==255||bytes[1]!==216)throw Error('invalid_image');let i=2;
 while(i+9<bytes.length){if(bytes[i++]!==255)continue;let marker=bytes[i++];while(marker===255)marker=bytes[i++];if(marker===217||marker===218)break;if(marker===0||marker===1||marker>=208&&marker<=215)continue;const len=bytes[i]*256+bytes[i+1];if(len<2)break;if([192,193,194].includes(marker))return {height:bytes[i+3]*256+bytes[i+4],width:bytes[i+5]*256+bytes[i+6]};i+=len;}
 throw Error('invalid_image');
}
