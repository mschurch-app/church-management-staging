// Editorial assets are church supplied, never presented as a submitter's photos.
const assets=Object.freeze({'quiet-waiting-v1':Object.freeze({url:'assets/testimonies/quiet-waiting-v1.webp',alt:'晨光照入窗邊，敞開的書、茶杯與橄欖枝，遠方是平靜湖面。',caption:'AI 示意插圖｜安靜等候中的平安與盼望'})});
export function resolveStoryIllustrations(plan){
 const seen=new Set();return (Array.isArray(plan?.illustrations)?plan.illustrations:[]).slice(0,3).flatMap(p=>{
  if(!p||!Object.hasOwn(assets,p.key)||seen.has(p.key)||!Number.isSafeInteger(p.after)||p.after<0||p.after>Math.max(0,(plan.paragraphs?.length||0)-2)||!['right','left','wide'].includes(p.style))return [];
  seen.add(p.key);return [{...assets[p.key],kind:'illustration',after:p.after,style:p.style}];
 });
}
