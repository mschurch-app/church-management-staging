import {AudioBufferSource,AudioBufferSource,BufferTarget,CanvasSource,Mp4OutputFormat,Output,Quality,canEncodeVideo} from 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm';

const WIDTH=720,HEIGHT=1280,FPS=24,DURATION=5;
function cover(ctx,image,progress){const zoom=1.02+progress*.05,scale=Math.max(WIDTH/image.width,HEIGHT/image.height)*zoom,w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(WIDTH-w)/2,(HEIGHT-h)/2,w,h);}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function wrap(ctx,text,maxWidth,maxLines=3){const chars=[...String(text||'')],lines=[];let line='';for(const char of chars){const next=line+char;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=char;if(lines.length===maxLines-1)break;}else line=next;}if(line&&lines.length<maxLines)lines.push(line);const used=lines.join('').length;if(used<chars.length)lines[lines.length-1]=lines[lines.length-1].replace(/[，。！？、,.!?…]*$/,'')+'…';return lines;}
function drawFrame(ctx,image,data,progress){
  ctx.save();cover(ctx,image,progress);ctx.fillStyle='rgba(20,28,25,.30)';ctx.fillRect(0,0,WIDTH,HEIGHT);const gradient=ctx.createLinearGradient(0,280,0,1280);gradient.addColorStop(0,'rgba(20,35,31,.04)');gradient.addColorStop(.55,'rgba(17,45,39,.64)');gradient.addColorStop(1,'rgba(16,50,43,.94)');ctx.fillStyle=gradient;ctx.fillRect(0,0,WIDTH,HEIGHT);
  const rise=Math.max(0,(.16-progress)*110),fade=Math.min(1,progress/.18,(1-progress)/.12);ctx.globalAlpha=Math.max(.15,fade);ctx.translate(0,rise);
  ctx.fillStyle='rgba(255,255,255,.94)';roundedRect(ctx,54,70,198,54,27);ctx.fillStyle='#153f37';ctx.font='800 23px system-ui,"Noto Sans TC",sans-serif';ctx.fillText('M+ 大雅教會',78,106);
  ctx.fillStyle='#ffd893';ctx.font='800 24px system-ui,"Noto Sans TC",sans-serif';ctx.fillText('THIS SUNDAY · 主日信息',58,750);
  ctx.fillStyle='#fff';ctx.font='800 58px system-ui,"Noto Sans TC",sans-serif';let y=828;for(const line of wrap(ctx,data.title,606,3)){ctx.fillText(line,58,y);y+=76;}
  ctx.fillStyle='rgba(255,255,255,.84)';ctx.font='500 28px system-ui,"Noto Sans TC",sans-serif';for(const line of wrap(ctx,data.subtitle,600,2)){ctx.fillText(line,58,y+12);y+=43;}
  ctx.fillStyle='rgba(255,255,255,.16)';roundedRect(ctx,54,1110,612,92,24);ctx.fillStyle='#fff';ctx.font='750 28px system-ui,"Noto Sans TC",sans-serif';ctx.fillText(data.dateLabel,82,1166);ctx.font='650 22px system-ui,"Noto Sans TC",sans-serif';ctx.textAlign='right';ctx.fillText('歡迎回家',636,1166);ctx.textAlign='left';ctx.restore();
}
async function loadImage(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('reel_image');return createImageBitmap(await response.blob());}
export function reelSupported(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';}
async function musicBuffer(url){if(!url)return null;const raw=await (await fetch(url,{cache:'no-store'})).arrayBuffer(),context=new AudioContext({sampleRate:48000}),decoded=await context.decodeAudioData(raw),frames=48000*DURATION,out=new AudioBuffer({length:frames,numberOfChannels:Math.min(2,decoded.numberOfChannels),sampleRate:48000});for(let channel=0;channel<out.numberOfChannels;channel++){const target=out.getChannelData(channel),source=decoded.getChannelData(channel);for(let i=0;i<frames;i++){const fade=Math.min(1,i/9600,(frames-i)/19200);target[i]=source[i%source.length]*.24*Math.max(0,fade);}}await context.close();return out;}
export async function createWeeklyReel({imageUrl,title,subtitle,serviceDate,audioUrl=''}){
  if(!reelSupported())throw new Error('reel_unsupported');
  if(!await canEncodeVideo('avc',{width:WIDTH,height:HEIGHT,bitrate:3_000_000}))throw new Error('reel_unsupported');
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const ctx=canvas.getContext('2d',{alpha:false}),image=await loadImage(imageUrl),audio=await musicBuffer(audioUrl),target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target}),source=new CanvasSource(canvas,{codec:'avc',quality:new Quality('high'),bitrate:3_000_000});
  output.addVideoTrack(source,{frameRate:FPS});let audioSource=null;if(audio){audioSource=new AudioBufferSource({codec:'aac',bitrate:128000});output.addAudioTrack(audioSource);}await output.start();if(audioSource)await audioSource.add(audio);
  const dateLabel=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(`${serviceDate}T12:00:00+08:00`));
  for(let frame=0;frame<FPS*DURATION;frame++){const progress=frame/(FPS*DURATION-1);drawFrame(ctx,image,{title,subtitle,dateLabel},progress);await source.add(frame/FPS,1/FPS);}
  await output.finalize();image.close();if(!target.buffer)throw new Error('reel_encode');return new Blob([target.buffer],{type:'video/mp4'});
}
