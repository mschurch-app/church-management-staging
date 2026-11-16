// Canva supplies fresh art; original photographs and exact text stay intact.
async function image(url){if(!url)throw Error('upload_incomplete');const img=new Image();img.crossOrigin='anonymous';img.src=url;let timer;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('canva_image_save_failed')),20000);})]);return img;}finally{clearTimeout(timer);}}
function lines(c,text,width){const result=[];let line='';for(const char of String(text)){if(char==='\n'){result.push(line);line='';continue;}if(c.measureText(line+char).width>width&&line){result.push(line);line=char;}else line+=char;}if(line)result.push(line);return result;}
export function canvaPhotoBoxes(count,layout='balanced'){
 const x=64,y=380,w=952,h=650,gap=20;
 if(count===1)return [{x,y,w,h}];
 if(count===2)return layout==='focus'?[{x,y,w:580,h},{x:x+600,y,w:352,h}]:[{x,y,w,h:315},{x,y:y+335,w,h:315}];
 const hero=layout==='focus'?350:380,rest=count-1,cols=2,rows=Math.ceil(rest/cols),cellH=(h-hero-gap-(rows-1)*gap)/rows;
 return [{x,y,w,h:hero},...Array.from({length:rest},(_,i)=>({x:x+(i%cols)*486,y:y+hero+gap+Math.floor(i/cols)*(cellH+gap),w:466,h:cellH}))];
}
export async function composeCanvaStory(row){
 if(!row.design_url||row.photo_urls?.length!==row.images?.length||row.images.length<1||row.images.length>5)throw Error('upload_incomplete');
 const [art,...photos]=await Promise.all([row.design_url,...row.photo_urls].map(image));if(art.naturalWidth<600||art.naturalHeight<600)throw Error('canva_invalid_export');
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');c.drawImage(art,0,0,1080,1350);
 c.fillStyle='rgba(18,61,49,.92)';c.beginPath();c.roundRect(48,40,984,310,30);c.fill();c.fillStyle='#fff5dc';c.font='600 22px system-ui';c.fillText('照片說故事',78,82);
 let font=58,titleLines;do{c.font=`700 ${font}px system-ui`;titleLines=lines(c,row.title,914);if(titleLines.length*font*1.3<=230)break;font-=2;}while(font>28);
 if(titleLines.length*font*1.3>230)throw Error('content_required');c.fillStyle='#fffdf5';titleLines.forEach((line,i)=>c.fillText(line,78,144+i*font*1.3));
 const boxes=canvaPhotoBoxes(photos.length,row.layout_key);photos.forEach((photo,i)=>{const b=boxes[i];c.save();c.shadowColor='#15342c55';c.shadowBlur=18;c.shadowOffsetY=6;c.fillStyle='#f5edd8';c.beginPath();c.roundRect(b.x,b.y,b.w,b.h,20);c.fill();c.restore();const pad=12,scale=Math.min((b.w-pad*2)/photo.naturalWidth,(b.h-pad*2)/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;c.drawImage(photo,b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h);});
 c.fillStyle='rgba(18,61,49,.92)';c.beginPath();c.roundRect(48,1060,984,240,26);c.fill();c.fillStyle='#fffdf5';let size=30,summaryLines;do{c.font=`500 ${size}px system-ui`;summaryLines=String(row.key_points||'').split('\n').flatMap(p=>lines(c,p,910));if(summaryLines.length*(size*1.4)<=150)break;size-=1;}while(size>18);if(summaryLines.length*size*1.4>150)throw Error('invalid_key_points');summaryLines.forEach((line,i)=>c.fillText(line,80,1107+i*size*1.4));c.font='500 20px system-ui';c.fillStyle='#f7dfad';c.fillText('社團法人台灣基督教社會關懷協會',80,1273);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.95));if(!blob||blob.size>8*1024*1024)throw Error('canva_image_save_failed');return new File([blob],'association-canva-story.jpg',{type:'image/jpeg'});
}
