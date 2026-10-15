import {AudioBufferSource,BufferTarget,CanvasSource,Mp4OutputFormat,Output,Quality,canEncodeVideo} from 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm';

const WIDTH=720,HEIGHT=1280,FPS=24,DURATION=8;
function hero(ctx,image,progress){const scale=Math.min(612/image.width,344/image.height)*(1+progress*.015),w=image.width*scale,h=image.height*scale,x=(WIDTH-w)/2,y=190+(344-h)/2;ctx.save();ctx.beginPath();ctx.roundRect(54,190,612,344,24);ctx.clip();ctx.drawImage(image,x,y,w,h);ctx.restore();}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function wrap(ctx,text,maxWidth,maxLines=3){const chars=[...String(text||'')],lines=[];let line='';for(const char of chars){const next=line+char;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=char;if(lines.length===maxLines-1)break;}else line=next;}if(line&&lines.length<maxLines)lines.push(line);const used=lines.join('').length;if(used<chars.length)lines[lines.length-1]=lines[lines.length-1].replace(/[，。！？、,.!?…]*$/,'')+'…';return lines;}
function drawFrame(ctx,image,data,progress){
  ctx.save();const gradient=ctx.createLinearGradient(0,0,0,1280);gradient.addColorStop(0,'#071713');gradient.addColorStop(1,'#123d35');ctx.fillStyle=gradient;ctx.fillRect(0,0,WIDTH,HEIGHT);hero(ctx,image,progress);
  const rise=Math.max(0,(.16-progress)*85),fade=Math.min(1,progress/.18,(1-progress)/.12);ctx.globalAlpha=Math.max(.15,fade);ctx.translate(0,rise);
  ctx.fillStyle='rgba(255,255,255,.95)';roundedRect(ctx,54,70,220,54,27);ctx.fillStyle='#153f37';ctx.font='800 23px system-ui,"Noto Sans TC",sans-serif';ctx.fillText('M+ 大雅教會',78,106);
  if(data.photo){ctx.save();ctx.beginPath();ctx.arc(565,454,92,0,Math.PI*2);ctx.clip();const scale=Math.max(184/data.photo.width,184/data.photo.height),w=data.photo.width*scale,h=data.photo.height*scale;ctx.drawImage(data.photo,565-w/2,454-h/2,w,h);ctx.restore();ctx.strokeStyle='#ffd060';ctx.lineWidth=7;ctx.beginPath();ctx.arc(565,454,94,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#ffd060';ctx.font='800 23px system-ui,"Noto Sans TC",sans-serif';ctx.fillText('主日信息 · 歡迎參加',54,592);
  ctx.fillStyle='#fff';ctx.font='800 46px system-ui,"Noto Sans TC",sans-serif';wrap(ctx,data.title,610,2).forEach((line,i)=>ctx.fillText(line,54,660+i*58));
  const card=(y,label,value)=>{ctx.fillStyle='rgba(255,255,255,.12)';roundedRect(ctx,54,y,612,105,24);ctx.fillStyle='#ffd060';ctx.font='650 21px system-ui,"Noto Sans TC",sans-serif';ctx.fillText(label,76,y+34);ctx.fillStyle='#fff';ctx.font='750 28px system-ui,"Noto Sans TC",sans-serif';ctx.fillText(String(value||'').slice(0,36),76,y+75);};
  card(786,'主日日期',data.dateLabel);card(910,'經文',data.scripture);card(1034,'講員',data.speaker);
  ctx.fillStyle='rgba(255,255,255,.55)';ctx.font='600 19px system-ui,"Noto Sans TC",sans-serif';ctx.fillText('MPLUS CHURCH · TAICHUNG',54,1210);ctx.restore();
}
async function loadImage(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('reel_image');return createImageBitmap(await response.blob());}
export function reelSupported(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';}
async function musicBuffer(url,startSeconds=0){if(!url)return null;const raw=await (await fetch(url,{cache:'no-store'})).arrayBuffer(),context=new AudioContext({sampleRate:48000}),decoded=await context.decodeAudioData(raw),frames=48000*DURATION,out=new AudioBuffer({length:frames,numberOfChannels:Math.min(2,decoded.numberOfChannels),sampleRate:48000});for(let channel=0;channel<out.numberOfChannels;channel++){const target=out.getChannelData(channel),source=decoded.getChannelData(channel);for(let i=0;i<frames;i++){const fade=Math.min(1,i/9600,(frames-i)/19200);target[i]=source[(Math.floor(startSeconds*decoded.sampleRate)+i)%source.length]*.24*Math.max(0,fade);}}await context.close();return out;}
export async function createWeeklyReel({imageUrl,photoUrl='',title,scripture='',speaker='',serviceDate,audioUrl='',audioStart=0,onProgress=()=>{}}){
  onProgress({phase:'prepare',completed:0,total:FPS*DURATION});
  if(!reelSupported())throw new Error('reel_unsupported');
  if(!await canEncodeVideo('avc',{width:WIDTH,height:HEIGHT,quality:new Quality({bitrate:3_000_000})}))throw new Error('reel_unsupported');
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const ctx=canvas.getContext('2d',{alpha:false}),image=await loadImage(imageUrl),photo=photoUrl?await loadImage(photoUrl):null,audio=await musicBuffer(audioUrl,audioStart),target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target}),source=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:3_000_000})});
  output.addVideoTrack(source,{frameRate:FPS});let audioSource=null;if(audio){audioSource=new AudioBufferSource({codec:'aac',bitrate:128000});output.addAudioTrack(audioSource);}await output.start();if(audioSource)await audioSource.add(audio);
  const dateLabel=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(`${serviceDate}T12:00:00+08:00`));
  for(let frame=0;frame<FPS*DURATION;frame++){const progress=frame/(FPS*DURATION-1);drawFrame(ctx,image,{title,scripture,speaker,dateLabel,photo},progress);await source.add(frame/FPS,1/FPS);onProgress({phase:'frames',completed:frame+1,total:FPS*DURATION});if(frame%6===0)await new Promise(resolve=>setTimeout(resolve,0));}
  onProgress({phase:'finalize',completed:FPS*DURATION,total:FPS*DURATION});await output.finalize();image.close();photo?.close();if(!target.buffer)throw new Error('reel_encode');return new Blob([target.buffer],{type:'video/mp4'});
}
