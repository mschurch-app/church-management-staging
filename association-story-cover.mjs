// Canvas-only presentation: preserve every supplied photograph and keep titles outside it.
export const LAYOUTS={balanced:'整齊相框',focus:'主圖與小照片',strip:'故事橫列'};
export const THEMES={forest:'深墨綠',charcoal:'炭灰',earth:'暖棕'};
const palettes={forest:['#102a26','#315247','#e3c89f'],charcoal:['#191f25','#38434c','#dbbf94'],earth:['#30261f','#5b493b','#ead1a8']};
function rounded(c,x,y,w,h,r=20){c.beginPath();c.roundRect(x,y,w,h,r);}
function wrap(c,value,width){const lines=[];let line='';for(const ch of value){if(c.measureText(line+ch).width>width){if(/[，。！？；：、）】」』]/.test(ch)&&line){lines.push(line.slice(0,-1));line=line.slice(-1)+ch;}else{lines.push(line);line=ch;}}else line+=ch;}if(line)lines.push(line);return lines;}
export async function renderStoryCover({title,layout_key='balanced',theme_key='forest'},photoUrls){
 if(!title?.trim()||!photoUrls.length||photoUrls.length>5||!LAYOUTS[layout_key]||!THEMES[theme_key])throw Error('content_required');await document.fonts.ready;
 const images=await Promise.all(photoUrls.map(async url=>{const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode();return image;}));
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d'),[base,glow,gold]=palettes[theme_key],font='-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif';
 c.fillStyle=base;c.fillRect(0,0,1080,1350);const gradient=c.createRadialGradient(960,100,0,960,100,1300);gradient.addColorStop(0,glow);gradient.addColorStop(1,base);c.fillStyle=gradient;c.fillRect(0,0,1080,1350);
 const tile=document.createElement('canvas');tile.width=tile.height=128;const tc=tile.getContext('2d'),noise=tc.createImageData(128,128);let seed=37;for(let i=0;i<noise.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;noise.data[i]=noise.data[i+1]=noise.data[i+2]=seed>>>24;noise.data[i+3]=255;}tc.putImageData(noise,0,0);c.globalAlpha=.045;c.fillStyle=c.createPattern(tile,'repeat');c.fillRect(0,0,1080,1350);c.globalAlpha=1;
 c.fillStyle=gold;c.font=`500 25px ${font}`;c.fillText('夢想加油站',66,84);c.fillStyle='#f2f0e6cc';c.font=`400 23px ${font}`;c.fillText('照片說故事',820,84);
 const n=images.length,zone={x:60,y:145,w:960,h:740},gap=18;let boxes=[];
 if(n===1)boxes=[layout_key==='focus'?{x:180,y:135,w:720,h:770}:layout_key==='strip'?{x:60,y:210,w:960,h:600}:zone];
 else if(layout_key==='focus'&&n>=2){boxes=[{x:60,y:145,w:610,h:740}];const h=(740-gap*(n-2))/(n-1);for(let i=1;i<n;i++)boxes.push({x:688,y:145+(i-1)*(h+gap),w:332,h});}
 else if(layout_key==='strip'){const rows=n<=3?n:Math.ceil(n/2),h=(740-gap*(rows-1))/rows;for(let i=0;i<n;i++){const row=n<=3?i:Math.floor(i/2),cols=n<=3?1:Math.min(2,n-row*2),w=(960-gap*(cols-1))/cols;boxes.push({x:60+(i-(n<=3?i:row*2))*(w+gap),y:145+row*(h+gap),w,h});}}
 else{const topCount=n===2?2:Math.ceil(n/2),bottomCount=n-topCount,rows=bottomCount?2:1,h=(740-gap*(rows-1))/rows;for(let i=0;i<n;i++){const top=i<topCount,count=top?topCount:bottomCount,column=top?i:i-topCount,w=(960-gap*(count-1))/count;boxes.push({x:60+column*(w+gap),y:145+(top?0:h+gap),w,h});}}
 boxes.forEach((box,i)=>{c.fillStyle='#ffffff0c';rounded(c,box.x,box.y,box.w,box.h);c.fill();c.strokeStyle=gold+'66';c.lineWidth=1.5;c.stroke();const pad=12,image=images[i],scale=Math.min((box.w-pad*2)/image.naturalWidth,(box.h-pad*2)/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;c.save();c.filter='brightness(1.045) contrast(1.025) saturate(1.035)';c.drawImage(image,box.x+(box.w-w)/2,box.y+(box.h-h)/2,w,h);c.restore();});
 c.fillStyle=gold;c.fillRect(66,940,60,3);let lines,size;for(size=60;size>=28;size-=2){c.font=`600 ${size}px ${font}`;lines=wrap(c,title.trim(),948);if(lines.length<=3)break;}if(lines.length>3)throw Error('主題太長，請精簡後重做主圖。');c.fillStyle='#f4f1e9';lines.forEach((line,i)=>c.fillText(line,66,1025+i*78));c.fillStyle='#e6e8dfcc';c.font=`400 23px ${font}`;c.fillText('社團法人台灣基督教社會關懷協會',66,1280);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));if(!blob)throw Error('無法產生主圖，已填文字仍保留。');return new File([blob],'association-story-cover.jpg',{type:'image/jpeg'});
}
