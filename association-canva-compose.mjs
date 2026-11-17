// Canva supplies the illustration. Photo dimensions determine the final composition.
import {PALETTES} from './association-story-cover.mjs?v=20261116-preview-recovery1';
async function image(url){
 if(!url)throw Error('upload_incomplete');
 const img=new Image();img.crossOrigin='anonymous';img.src=url;let timer;
 try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('canva_image_save_failed')),20000);})]);return img;}finally{clearTimeout(timer);}
}
function lines(c,text,width){
 const result=[];let line='';
 for(const char of String(text)){if(char==='\n'){result.push(line);line='';continue;}if(c.measureText(line+char).width>width&&line){result.push(line);line=char;}else line+=char;}
 if(line)result.push(line);return result;
}
export function canvaPhotoBoxes(count,layout='balanced',ratios=Array(count).fill(1),area={x:54,y:300,w:972,h:790}){
 let groups;
 if(count===1)groups=[[0]];
 else if(count===2)groups=layout==='panorama'||ratios.every(r=>r>1.25)?[[0],[1]]:[[0,1]];
 else if(count===3)groups=layout==='gallery'?[[0,1,2]]:[[0],[1,2]];
 else if(count===4)groups=layout==='gallery'||layout==='mosaic'?[[0,1],[2,3]]:[[0],[1,2,3]];
 else groups=[[0,1],[2,3,4]];
 const gap=18;
 const heights=groups.map(group=>Math.min(groups.length===1?area.h:520,(area.w-gap*(group.length-1))/group.reduce((sum,i)=>sum+ratios[i],0)));
 const scale=Math.min(1,(area.h-gap*(groups.length-1))/heights.reduce((sum,h)=>sum+h,0));
 let y=area.y+(area.h-(heights.reduce((sum,h)=>sum+h*scale,0)+gap*(groups.length-1)))/2;
 const boxes=[];
 groups.forEach((group,index)=>{
  const h=heights[index]*scale,rowWidth=group.reduce((sum,i)=>sum+h*ratios[i],0)+gap*(group.length-1);
  let x=area.x+(area.w-rowWidth)/2;
  for(const i of group){boxes[i]={x,y,w:h*ratios[i],h};x+=h*ratios[i]+gap;}
  y+=h+gap;
 });
 return boxes;
}
export async function composeCanvaStory(row){
 if(!row.design_url||row.photo_urls?.length!==row.images?.length||row.images.length<1||row.images.length>5)throw Error('upload_incomplete');
 const [art,...photos]=await Promise.all([row.design_url,...row.photo_urls].map(image));
 if(art.naturalWidth<600||art.naturalHeight<600)throw Error('canva_invalid_export');
 await document.fonts?.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
 const palette=PALETTES[row.theme_key]||PALETTES.sunshine,base=palette[0],ink=palette[3]||'#fff5df',accent=palette[2];
 c.drawImage(art,0,0,1080,1350);
 // A palette-coloured wash keeps the illustration visible without fighting the title.
 c.fillStyle=base+'b8';c.fillRect(0,0,1080,1350);
 const top=c.createLinearGradient(0,0,0,470);top.addColorStop(0,base+'ff');top.addColorStop(.75,base+'e8');top.addColorStop(1,base+'00');c.fillStyle=top;c.fillRect(0,0,1080,470);
 c.fillStyle=ink;c.font='600 23px system-ui';c.fillText('台灣基督教社會關懷協會',58,59);
 c.fillStyle=accent;c.fillRect(58,85,64,5);
 let font=60,titleLines;
 do{c.font=`700 ${font}px system-ui`;titleLines=lines(c,row.title,960);if(titleLines.length<=3)break;font-=2;}while(font>32);
 if(titleLines.length>4)throw Error('content_required');
 c.fillStyle=ink;titleLines.forEach((line,i)=>c.fillText(line,54,153+i*font*1.23));
 const titleBottom=153+(titleLines.length-1)*font*1.23+30;
 let summaryLines=[],size=29;
 do{c.font=`500 ${size}px system-ui`;summaryLines=String(row.key_points||'').split('\n').filter(Boolean).flatMap(p=>lines(c,p,950));if(summaryLines.length*size*1.4<=156)break;size--;}while(size>20);
 if(summaryLines.length*size*1.4>180)throw Error('invalid_key_points');
 const summaryHeight=summaryLines.length?summaryLines.length*size*1.4+54:0;
 const bottom=1280-summaryHeight;
 const boxes=canvaPhotoBoxes(photos.length,row.layout_key,photos.map(p=>p.naturalWidth/p.naturalHeight),{x:54,y:titleBottom,w:972,h:bottom-titleBottom-24});
 photos.forEach((photo,i)=>{
  const b=boxes[i];c.save();c.shadowColor='#15211f44';c.shadowBlur=24;c.shadowOffsetY=7;c.fillStyle=base;c.fillRect(b.x-5,b.y-5,b.w+10,b.h+10);c.restore();
  c.drawImage(photo,b.x,b.y,b.w,b.h);
 });
 if(summaryLines.length){
  const wash=c.createLinearGradient(0,bottom-24,0,1350);wash.addColorStop(0,base+'00');wash.addColorStop(.25,base+'f5');wash.addColorStop(1,base+'ff');c.fillStyle=wash;c.fillRect(0,bottom-24,1080,1374-bottom);
  c.fillStyle=accent;c.fillRect(58,bottom+18,45,4);c.fillStyle=ink;c.font=`500 ${size}px system-ui`;summaryLines.forEach((line,i)=>c.fillText(line,58,bottom+62+i*size*1.4));
 }
 c.fillStyle=ink;c.globalAlpha=.7;c.font='500 20px system-ui';c.fillText('讓陪伴，成為每一天的力量。',58,1313);c.globalAlpha=1;
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.95));if(!blob||blob.size>8*1024*1024)throw Error('canva_image_save_failed');return new File([blob],'association-canva-story.jpg',{type:'image/jpeg'});
}
