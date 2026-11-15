import qrcode from './vendor/qrcode-generator-1.4.4.mjs';
import {validatePlan} from './testimony-carousel-model.mjs';
const FONT='-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif',INK='#f3f0e7',GOLD='#cbb18c';
function lines(c,value,width){const rows=[];let line='';for(const ch of String(value)){if(ch==='\n'||c.measureText(line+ch).width>width){if(/[，。！？；：、）】」』]/.test(ch)&&line.length>1){rows.push(line.slice(0,-1));line=line.slice(-1)+ch;}else{rows.push(line);line=ch==='\n'?'':ch;}}else line+=ch;}if(line)rows.push(line);if(rows.length>1&&Array.from(rows.at(-1)).length<4){const previous=Array.from(rows.at(-2)),tail=previous.splice(-Math.min(6,previous.length-1)).join('');rows[rows.length-2]=previous.join('');rows[rows.length-1]=tail+rows.at(-1);}return rows;}
function text(c,value,x,y,width,size,height,max,color=INK,weight=500){for(let font=size;font>=28;font-=2){c.font=`${weight} ${font}px ${FONT}`;const rows=lines(c,value,width);if(rows.length<=max){c.fillStyle=color;rows.forEach((row,i)=>c.fillText(row,x,y+i*height));return;}}throw Error('圖卡文字太多，請精簡後重試。');}
function round(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function grain(c,alpha=0.055){const tile=document.createElement('canvas');tile.width=tile.height=180;const t=tile.getContext('2d'),d=t.createImageData(180,180);let seed=173;for(let i=0;i<d.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=seed>>>24;d.data[i]=d.data[i+1]=d.data[i+2]=n;d.data[i+3]=255;}t.putImageData(d,0,0);c.save();c.globalAlpha=alpha;c.fillStyle=c.createPattern(tile,'repeat');c.fillRect(0,0,1080,1350);c.restore();}
function background(c){c.fillStyle='#0b1c1c';c.fillRect(0,0,1080,1350);const g=c.createRadialGradient(960,100,0,960,100,1150);g.addColorStop(0,'#244d45');g.addColorStop(1,'#0b1c1c');c.fillStyle=g;c.fillRect(0,0,1080,1350);const glow=c.createRadialGradient(-80,1100,0,-80,1100,1000);glow.addColorStop(0,'#293b32aa');glow.addColorStop(1,'#0b1c1c00');c.fillStyle=glow;c.fillRect(0,0,1080,1350);grain(c);}
function glass(c,x,y,w,h,r=30){c.save();c.shadowColor='#0006';c.shadowBlur=36;c.shadowOffsetY=12;round(c,x,y,w,h,r);c.fillStyle='#29433e66';c.fill();c.shadowColor='transparent';const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#d9e6d826');g.addColorStop(.5,'#c6d7cb0c');g.addColorStop(1,'#c7d7cf16');c.strokeStyle=g;c.lineWidth=1.5;c.stroke();c.restore();}
function brand(c){c.font=`500 25px ${FONT}`;c.fillStyle=GOLD;c.fillText('M+ CHURCH',76,88);c.fillStyle='#e4e8e2bb';c.font=`400 25px ${FONT}`;c.fillText('雲彩見證',290,88);c.strokeStyle='#b9cfc329';c.lineWidth=1;c.beginPath();c.moveTo(76,120);c.lineTo(1004,120);c.stroke();}
export async function renderCarousel(plan,id,photoUrl){
 validatePlan(plan,id);await document.fonts.ready;let photo=null;
 if(plan.cover_slot!==null||plan.cover_illustration){photoUrl=photoUrl||(plan.cover_illustration?new URL('./assets/testimony-carousel/'+plan.cover_illustration+'.png',import.meta.url).href:null);if(!photoUrl)throw Error('請先選取投稿照片。');photo=new Image();photo.crossOrigin='anonymous';photo.src=photoUrl;await photo.decode();}
 const total=plan.slides.length+2,files=[];
 for(let index=0;index<total;index++){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');background(c);
  if(index===0){
   if(photo){
    const scale=Math.max(1080/photo.naturalWidth,1350/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;
    c.drawImage(photo,(1080-w)/2,(1350-h)/2,w,h);c.fillStyle=plan.cover_illustration?'#07161588':'#07161525';c.fillRect(0,0,1080,1350);
    const shade=c.createLinearGradient(0,550,0,1350);shade.addColorStop(0,'#071b1900');shade.addColorStop(.45,'#071b1944');shade.addColorStop(1,'#071b19ef');c.fillStyle=shade;c.fillRect(0,550,1080,800);
    c.save();round(c,48,850,984,420,32);c.clip();c.filter='blur(24px)';c.drawImage(photo,(1080-w)/2,(1350-h)/2,w,h);c.filter='none';c.fillStyle='#102925dc';c.fillRect(48,850,984,420);grain(c,.07);c.restore();glass(c,48,850,984,420,32);
    c.fillStyle=GOLD;c.fillRect(88,894,58,3);text(c,plan.title,88,975,904,58,82,3,INK,600);text(c,plan.display_name,88,1220,830,30,42,1,'#d9e3d9',400);
    if(plan.cover_illustration){c.font=`400 21px ${FONT}`;c.fillStyle='#d7e4d4bb';c.fillText('AI 情境示意圖',76,812);}
    const top=c.createLinearGradient(0,0,0,180);top.addColorStop(0,'#071b19b8');top.addColorStop(1,'#071b1900');c.fillStyle=top;c.fillRect(0,0,1080,180);
   }else{glass(c,48,270,984,780);c.fillStyle=GOLD;c.fillRect(88,330,58,3);text(c,plan.title,88,455,904,70,102,6,INK,600);text(c,plan.display_name,88,990,904,30,42,1,'#d9e3d9',400);}
   brand(c);
  }else if(index===total-1){
   brand(c);text(c,'每一個生命，\n都有神恩典的故事。',76,275,928,60,88,3,INK,500);glass(c,48,460,984,745);
   text(c,'故事還沒結束',88,550,880,32,46,1,GOLD,400);text(c,'閱讀完整見證',88,620,880,48,66,2);
   const qr=qrcode(0,'M');qr.addData(plan.url,'Byte');qr.make();const size=qr.getModuleCount(),cell=Math.floor(404/(size+8)),ox=88,oy=690;
   c.fillStyle='#f3f0e7';round(c,ox,oy,(size+8)*cell,(size+8)*cell,10);c.fill();c.fillStyle='#12342e';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.isDark(y,x))c.fillRect(ox+(x+4)*cell,oy+(y+4)*cell,cell,cell);
   text(c,'掃碼看全文\n一起見證恩典',570,830,360,38,62,3,'#e0e8dc',400);text(c,'mchurch.online',88,1155,880,30,44,1,GOLD,400);
  }else{
   brand(c);text(c,String(index).padStart(2,'0'),76,235,150,48,64,1,GOLD,300);text(c,plan.slides[index-1].heading,76,300,928,54,76,2,INK,600);
   glass(c,48,400,984,742);c.fillStyle=GOLD;c.fillRect(88,449,44,3);text(c,plan.slides[index-1].text,88,548,904,48,78,8,'#edf0e8',400);text(c,plan.display_name,76,1240,800,28,42,1,'#c4d1c7',400);
  }
  c.font=`400 23px ${FONT}`;c.fillStyle='#becdc3a6';c.fillText(`${String(index+1).padStart(2,'0')}  /  ${String(total).padStart(2,'0')}`,888,1300);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.94));if(!blob)throw Error('無法產生圖卡，請重試。');files.push(new File([blob],`mplus-testimony-${index+1}.jpg`,{type:'image/jpeg'}));
 }
 return files;
}
