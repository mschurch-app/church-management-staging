// Versioned, deterministic composition. Offsets reference the untouched original body;
// media references use upload slots, never signed URLs or personal contact details.
function paragraphs(body){
 const parts=[];
 for(const line of body.replace(/\r\n?/g,'\n').split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  if(line.length<=360){parts.push(line);continue;}
  let part='';for(const sentence of line.match(/[^。！？!?]*[。！？!?]+[」』”’"]?|[^。！？!?]+$/gu)||[line]){
   part+=sentence;if(part.length>=180){parts.push(part);part='';}
  }if(part)parts.push(part);
 }return parts;
}
export function buildStoryPresentation(body='',media=[]){
 body=String(body);let cursor=0;
 let ranges=paragraphs(body).map(text=>{const start=body.indexOf(text,cursor);cursor=start+text.length;return {start,end:cursor};});
 if(ranges.length>80){const groups=[],size=Math.ceil(ranges.length/80);for(let i=0;i<ranges.length;i+=size)groups.push({start:ranges[i].start,end:ranges[Math.min(i+size,ranges.length)-1].end});ranges=groups;}
 const gaps=Math.max(1,ranges.length-2);let photo=0;
 const placements=media.map((m,index)=>({slot:m.slot??index,after:media.length===1?0:Math.round(index*(gaps-1)/(media.length-1)),style:m.kind==='video'?'wide':['right','wide','left'][photo++%3]}));
 return {version:1,paragraphs:ranges,placements};
}
export function resolveStoryPresentation(body='',media=[],saved){
 body=String(body);const valid=saved?.version===1&&Array.isArray(saved.paragraphs)&&saved.paragraphs.length<=80&&Array.isArray(saved.placements)&&saved.placements.length===media.length&&
  saved.paragraphs.every((r,i)=>Number.isSafeInteger(r.start)&&Number.isSafeInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=body.length&&(i===0||r.start>=saved.paragraphs[i-1].end))&&
  saved.paragraphs.map(r=>body.slice(r.start,r.end)).join('').replace(/\s/g,'')===body.replace(/\s/g,'')&&
  saved.placements.every((p,i)=>p.slot===(media[i].slot??i)&&Number.isSafeInteger(p.after)&&p.after>=0&&p.after<=Math.max(0,saved.paragraphs.length-2)&&['right','left','wide'].includes(p.style));
 return valid?saved:buildStoryPresentation(body,media);
}
