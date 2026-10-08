import {lineConfig,LINE_MEMBER_ENDPOINT,MEMBER_LIFF_IDS,PRAYER_LIFF_IDS} from './line-config.mjs?v=20261009-plus-state1';

const $=selector=>document.querySelector(selector),content=$('#content');
const BRANDS={
  'M+':{name:'M＋大雅教會',logo:'assets/brands/mplus-logo-white.png',accent:'#b96a40',soft:'#f8e8d8'},
  SHiNE:{name:'火樂教會',logo:'assets/brands/shine-logo.png',accent:'#c45f3e',soft:'#f9e3d7'},
};
const SHARED_FEATURES={today:['🌅','給今天的你','每天一句恩典與祝福'],prayer:['🙏','需要禱告時','進入即時動態禱告牆'],newcomer:['☕','歡迎新朋友','留下第一次相遇的印記'],weekly:['⛪','不見不散喔','本週聚會時間與位置'],love:['💌','把愛傳出去','製作祝福卡傳給好友']};
function features(){return config.church==='M+'?{today:SHARED_FEATURES.today,tree:['🌱','每日靈修生命樹','讀經、默想、回應，留下每天的成長'],service_signup:['🙌','主日服事登記','選擇服事與主日，額滿可候補'],prayer:SHARED_FEATURES.prayer,newcomer:SHARED_FEATURES.newcomer,weekly:['📰','本週週報','本週消息與主日資訊'],love:SHARED_FEATURES.love}:{today:SHARED_FEATURES.today,help:['🕊️','隨時的幫助','依此刻心情領受經文'],prayer:SHARED_FEATURES.prayer,newcomer:SHARED_FEATURES.newcomer,weekly:SHARED_FEATURES.weekly,love:SHARED_FEATURES.love};}

let config,idToken='',accessToken='',profile={name:'主內家人'},current='menu',payload,selectedLove=0,canvasUrl='';

const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const timeoutSignal=milliseconds=>typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(milliseconds):undefined;
function hero(eyebrow,title,copy){return `<header class="hero"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${copy}</p></header>`;}
function applyBrand(){const brand=BRANDS[config.church];document.documentElement.style.setProperty('--accent',brand.accent);document.documentElement.style.setProperty('--soft',brand.soft);$('#brand-logo').src=brand.logo;$('#brand-logo').alt=brand.name;$('#brand-name').textContent=brand.name;document.title=brand.name+'｜LINE 會友服務';}
function setConnection(value){$('#connection').textContent=value;}
function rememberLineToken(){try{if(idToken)sessionStorage.setItem(`line-member-token:${config.church}`,idToken);if(accessToken)sessionStorage.setItem(`line-member-access-token:${config.church}`,accessToken);}catch{}}
function featureFromLocation(){const query=new URLSearchParams(location.search);return query.get('feature')||config.feature||'menu';}
function route(feature,{replace=false}={}){if(!Object.hasOwn(features(),feature)&&feature!=='menu')feature='menu';current=feature;const url=new URL(location.href);url.searchParams.set('church',config.church);url.searchParams.set('feature',feature);url.searchParams.delete('liff.state');history[replace?'replaceState':'pushState']({},'',url);render().catch(showError);}
function lineCredentials(){return {idToken,accessToken};}
async function call(feature,extra={}){const response=await fetch(LINE_MEMBER_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'omit',signal:timeoutSignal(20000),body:JSON.stringify({action:'content',feature,church:config.church,...lineCredentials(),...extra})});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==true)throw new Error(data.error||'unavailable');return data;}
async function uploadShare(image){const response=await fetch(LINE_MEMBER_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'omit',signal:timeoutSignal(30000),body:JSON.stringify({action:'share_image',church:config.church,...lineCredentials(),image})});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==true)throw new Error(data.error||'upload_failed');return data.url;}

function menu(){const name=profile.name||'主內家人';content.innerHTML=`<section class="menu-welcome"><span>平安，${escape(name)}</span><strong>今天想從哪裡開始？</strong></section><nav class="feature-grid">${Object.entries(features()).map(([key,item],index)=>`<button class="feature-card" data-feature="${key}" style="--glow:${['#ffead5','#e1eee9','#ffe0cf','#f7ead5','#e6eddd','#ffe1d9'][index]}"><span class="icon">${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></button>`).join('')}</nav>`;content.querySelectorAll('[data-feature]').forEach(button=>button.onclick=()=>openFeature(button.dataset.feature));}
function openFeature(feature){if(feature==='prayer'){location.href=`https://liff.line.me/${PRAYER_LIFF_IDS[config.church]}`;return;}if(feature==='newcomer'){location.href=config.church==='SHiNE'?'shine-newcomer.html':`newcomer.html?church=${encodeURIComponent(config.church)}`;return;}if(feature==='today'){location.href=`today-verse-liff.html?church=${encodeURIComponent(config.church)}&v=20261007-download-fix1`;return;}if(feature==='tree'){rememberLineToken();location.href=`scripture-tree-preview.html?church=${encodeURIComponent(config.church)}&v=20261008-entry1`;return;}if(feature==='devotional'){rememberLineToken();const date=new URLSearchParams(location.search).get('date');location.href=`daily-devotional.html?church=${encodeURIComponent(config.church)}${date?'&date='+encodeURIComponent(date):''}`;return;}if(feature==='service_signup'){rememberLineToken();location.replace('service-signup.html?from=line');return;}route(feature);}

function updateStreak(){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),key='line-streak-'+config.church,stored=JSON.parse(localStorage.getItem(key)||'{}');let count=1;if(stored.date){const previous=new Date(stored.date+'T00:00:00+08:00'),now=new Date(today+'T00:00:00+08:00'),days=Math.round((now-previous)/86400000);count=days===0?(stored.count||1):days===1?(stored.count||0)+1:1;}localStorage.setItem(key,JSON.stringify({date:today,count}));$('#streak').hidden=false;$('#streak').textContent='🔥 連續 '+count+' 天';}
function todayPage(data){const item=data.item;content.innerHTML=`${hero('MORNING GRACE','給今天的你','停一下，讓一句話陪你走過今天。')}<article class="surface today-card"><span class="date-pill">☀️ ${escape(data.date)} · 晨光出發</span><h2>親愛的 ${escape(data.profile?.name||profile.name)}</h2><p class="scripture">「${escape(item.scripture)}」</p><p class="reference">— ${escape(item.scripture_ref)}</p><div class="blessing"><strong>💡 今日祝福</strong><p>${escape(item.prayer_text)}</p></div><button class="primary" id="amen">✨ 領受宣告，阿們！</button><div id="amen-response" class="response"></div></article>`;$('#amen').onclick=()=>{$('#amen').disabled=true;$('#amen-response').textContent='阿們！願今天滿有恩典、信心與平安。';navigator.vibrate?.(35);updateStreak();};updateStreak();}
function helpPage(data){const items=data.items||[],categories=[...new Set(items.map(item=>item.category).filter(Boolean))];if(!items.length){content.innerHTML=`${hero('A HELP IN TIME','隨時的幫助','此刻需要什麼樣的陪伴？')}<div class="surface empty">內容正在整理中，請稍後再來。</div>`;return;}let category=categories[0],index=0;content.innerHTML=`${hero('A HELP IN TIME','隨時的幫助','選擇此刻的心情，領受一段經文和禱告。')}<div class="mood-list">${categories.map((value,i)=>`<button data-category="${escape(value)}" class="${i?'':'active'}">${escape(value)}</button>`).join('')}</div><article id="help-card" class="surface help-card"></article>`;const draw=()=>{const pool=items.filter(item=>item.category===category),item=pool[index%pool.length];$('#help-card').innerHTML=`<span class="category-pill">🕊️ ${escape(item.category)}</span><blockquote>「${escape(item.scripture)}」</blockquote><p class="reference">— ${escape(item.scripture_ref)}</p><div class="blessing"><strong>一起禱告</strong><p>${escape(item.prayer_text)}</p></div><button class="primary" id="next-help">再領受一句</button>`;$('#next-help').onclick=()=>{index++;draw();};};content.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;index=0;content.querySelectorAll('[data-category]').forEach(item=>item.classList.toggle('active',item===button));draw();});draw();}
function weeklyPage(data){const items=data.items||[],settings=data.settings||{};content.innerHTML=`${hero('SEE YOU THIS WEEK','不見不散喔','看看本週聚會，期待與你見面。')}${items.map(item=>`<article class="surface gathering"><div class="day-tile"><small>週</small><b>${escape(item.day_name||item.day_of_week)}</b></div><div><h2>${escape(item.title)}</h2><p>🕒 ${escape(item.time||'時間請洽同工')}</p><p>📍 ${escape(item.location||settings.address||'地點請洽同工')}</p>${item.description?`<p>${escape(item.description)}</p>`:''}${settings.map_url?`<a class="map-link" href="${escape(settings.map_url)}" target="_blank" rel="noopener">查看交通方式 →</a>`:''}</div></article>`).join('')||'<div class="surface empty">本週聚會資訊整理中。</div>'}`;}

function imageElement(url,alt,cls=''){return url?`<img class="${cls}" src="${escape(url)}" alt="${escape(alt)}" crossorigin="anonymous">`:'';}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('image_load_failed'));image.src=new URL(url,document.baseURI).href;if(image.complete&&image.naturalWidth)resolve(image);});}
function cover(ctx,image,width,height){const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight),sourceWidth=width/scale,sourceHeight=height/scale;ctx.drawImage(image,(image.naturalWidth-sourceWidth)/2,(image.naturalHeight-sourceHeight)/2,sourceWidth,sourceHeight,0,0,width,height);}
function splitGreeting(item){
  const raw=String($('#message')?.value||item.share_caption||'').trim().replace(/^【[^】]*】\s*/,'');
  const match=raw.match(/「([\s\S]*?)」/);
  if(!match)return {verse:'',reference:'',blessing:raw};
  const rest=raw.slice(match.index+match[0].length).trim(),lines=rest.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const referenceIndex=lines.findIndex(line=>/^[—–-]\s*/.test(line));
  const reference=referenceIndex>=0?lines[referenceIndex].replace(/^[—–-]\s*/,'').trim():'';
  const blessing=lines.filter((line,index)=>index!==referenceIndex).join('\n').trim();
  return {verse:match[1].trim(),reference,blessing};
}
function lovePreview(item){
  const brand=BRANDS[config.church],signature=$('#signature')?.value||profile.name,recipient=$('#recipient')?.value||'親愛的好友',copy=splitGreeting(item);
  const verse=copy.verse?'<p class="love-verse">「'+escape(copy.verse)+'」</p>':'';
  const reference=copy.reference?'<span class="love-reference">— '+escape(copy.reference)+'</span>':'';
  const blessing=copy.blessing?'<p class="love-blessing">'+escape(copy.blessing).replace(/\n/g,'<br>')+'</p>':'';
  return '<div class="love-canvas-wrap" id="love-card">'+imageElement(item.image_url,item.title,'bg')+'<div class="love-copy"><img src="'+brand.logo+'" alt="'+brand.name+'"><span class="to">To. '+escape(recipient)+'</span><div class="love-copy-panel">'+verse+reference+blessing+'</div><span class="church">'+brand.name+'</span><span class="from">— '+escape(signature)+' 的誠摯祝福</span></div></div>';
}
function lovePage(data){
  const items=data.items||[];
  if(!items.length){content.innerHTML=hero('SHARE THE LOVE','把愛傳出去','把一句祝福送進好友心裡。')+'<div class="surface empty">管理員正在準備祝福圖卡。</div>';return;}
  selectedLove=Math.min(selectedLove,items.length-1);payload=data;
  const categoryNames=[...new Set(items.map(item=>item.category))],configured=(data.scenarios||[]).filter(item=>categoryNames.includes(item.name)),categories=configured.length?configured:categoryNames.map(name=>({name,icon:'💛'})),selected=()=>items[selectedLove];
  content.innerHTML=hero('SHARE THE LOVE','把愛傳出去','挑選照片、改寫祝福，再從 LINE 好友中選擇收件人。')+
    '<section class="surface love-preview" id="love-preview">'+lovePreview(selected())+'</section>'+
    '<section class="surface love-builder"><div class="category-list">'+categories.map((category,i)=>'<button class="'+(i?'':'active')+'" data-love-category="'+escape(category.name)+'">'+escape(category.icon||'💛')+' '+escape(category.name)+'</button>').join('')+'</div>'+
    '<div class="scene-strip" id="scenes"></div><button type="button" class="secondary" id="next-love-verse">🔄 換一句經文／祝福</button>'+
    '<label class="field">收件人稱呼<input id="recipient" value="親愛的好友" maxlength="30"></label>'+
    '<label class="field">你的署名<input id="signature" value="'+escape(profile.name)+'" maxlength="30"></label>'+
    '<label class="field">祝福話語<textarea id="message" maxlength="220">'+escape(selected().share_caption)+'</textarea></label>'+
    '<div class="action-row"><button class="secondary" id="download">下載圖卡</button><button class="primary" id="share">LINE 選好友傳送</button></div><p class="share-status" id="share-status"></p></section>';
  let activeCategory=categories[0].name;
  const drawScenes=()=>{
    const list=items.map((item,index)=>({item,index})).filter(entry=>entry.item.category===activeCategory);
    $('#scenes').innerHTML=list.map(entry=>'<button data-scene="'+entry.index+'" class="'+(entry.index===selectedLove?'active':'')+'">'+imageElement(entry.item.image_url,entry.item.title)+'</button>').join('');
    $('#scenes').querySelectorAll('[data-scene]').forEach(button=>button.onclick=()=>{selectedLove=Number(button.dataset.scene);$('#message').value=selected().share_caption;refreshLove();drawScenes();});
  };
  content.querySelectorAll('[data-love-category]').forEach(button=>button.onclick=()=>{
    activeCategory=button.dataset.loveCategory;const first=items.findIndex(item=>item.category===activeCategory);selectedLove=Math.max(0,first);
    content.querySelectorAll('[data-love-category]').forEach(item=>item.classList.toggle('active',item===button));
    $('#message').value=selected().share_caption;refreshLove();drawScenes();
  });
  $('#next-love-verse').onclick=event=>{const button=event.currentTarget,captions=[...new Set(items.filter(item=>item.category===activeCategory).map(item=>String(item.share_caption||'').trim()).filter(Boolean))];if(captions.length<2){button.textContent='此情境目前只有一則祝福';$('#share-status').textContent='請先切換其他祝福情境。';setTimeout(()=>{if(button.isConnected)button.textContent='🔄 換一句經文／祝福';},1800);return;}const currentCaption=$('#message').value.trim(),currentIndex=captions.indexOf(currentCaption),nextIndex=currentIndex<0?0:(currentIndex+1)%captions.length;$('#message').value=captions[nextIndex];refreshLove();button.disabled=true;button.textContent='✓ 已更換';$('#share-status').textContent='已換成這個情境第 '+(nextIndex+1)+' 則經文／祝福。';navigator.vibrate?.(25);setTimeout(()=>{if(button.isConnected){button.disabled=false;button.textContent='🔄 換一句經文／祝福';}},500);};
  const refreshLove=()=>{$('#love-preview').innerHTML=lovePreview(selected());};
  for(const id of ['recipient','signature','message'])$('#'+id).addEventListener('input',refreshLove);
  drawScenes();
  $('#download').onclick=async()=>{const button=$('#download'),downloadStatus=$('#share-status');button.disabled=true;downloadStatus.textContent='正在製作圖卡…';try{const image=await composeCard(selected());showDownloadPreview(image);downloadStatus.textContent='圖卡已完成，請長按圖片儲存。';}catch{downloadStatus.textContent='圖片尚未載入完成，請稍候再試。';}finally{button.disabled=false;}};
  $('#share').onclick=()=>shareLove(selected());
}
function wrapParagraphs(ctx,text,maxWidth){
  const paragraphs=String(text||'').split(/\r?\n/),lines=[];
  for(const paragraph of paragraphs){
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const char of [...paragraph]){
      const next=line+char;
      if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=char;}else line=next;
    }
    if(line)lines.push(line);
  }
  return lines;
}
function roundedRect(ctx,x,y,width,height,radius){
  ctx.beginPath();
  if(ctx.roundRect){ctx.roundRect(x,y,width,height,radius);return;}
  ctx.moveTo(x+radius,y);ctx.lineTo(x+width-radius,y);ctx.quadraticCurveTo(x+width,y,x+width,y+radius);ctx.lineTo(x+width,y+height-radius);ctx.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);ctx.lineTo(x+radius,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-radius);ctx.lineTo(x,y+radius);ctx.quadraticCurveTo(x,y,x+radius,y);ctx.closePath();
}
function showDownloadPreview(image){
  document.querySelector('.download-preview')?.remove();
  const overlay=document.createElement('section');overlay.className='download-preview';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','儲存祝福圖卡');
  overlay.innerHTML='<div class="download-preview-panel"><div class="download-preview-head"><strong>圖卡已製作完成</strong><button type="button" aria-label="關閉">×</button></div><p>在 LINE 內請按「儲存圖片」並在分享選單選「儲存影像」；也可以長按預覽圖儲存。</p><img alt="已完成的教會祝福圖卡"><button type="button" class="primary download-file">儲存圖片</button><p class="download-result" role="status" aria-live="polite"></p></div>';
  const img=overlay.querySelector('img'),download=overlay.querySelector('.download-file'),result=overlay.querySelector('.download-result');let objectUrl='';const close=()=>{overlay.remove();if(objectUrl)URL.revokeObjectURL(objectUrl);};fetch(image).then(response=>response.blob()).then(blob=>{objectUrl=URL.createObjectURL(blob);img.src=objectUrl;download.onclick=async()=>{const file=new File([blob],'教會祝福卡.jpg',{type:'image/jpeg'});if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:'教會祝福卡'});result.textContent='已開啟分享選單，請選擇「儲存影像」。';return;}catch(error){if(error.name==='AbortError'){result.textContent='已取消儲存。';return;}}}const link=document.createElement('a');link.href=objectUrl;link.download='教會祝福卡.jpg';document.body.append(link);link.click();link.remove();result.textContent='若沒有開始下載，請長按上方圖片並選擇「儲存影像」。';};}).catch(()=>{result.textContent='圖片準備失敗，請關閉後重新製作。';download.disabled=true;});overlay.querySelector('.download-preview-head button').onclick=close;overlay.onclick=event=>{if(event.target===overlay)close();};document.body.append(overlay);
}
async function composeCard(item){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d'),brand=BRANDS[config.church],copy=splitGreeting(item);
  ctx.fillStyle=brand.accent;ctx.fillRect(0,0,canvas.width,canvas.height);
  if(item.image_url){cover(ctx,await loadImage(item.image_url),canvas.width,canvas.height);}
  const shade=ctx.createLinearGradient(0,0,0,canvas.height);shade.addColorStop(0,'rgba(16,48,42,.10)');shade.addColorStop(.45,'rgba(16,48,42,.18)');shade.addColorStop(1,'rgba(16,48,42,.58)');ctx.fillStyle=shade;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=3;ctx.strokeRect(58,58,964,1234);
  try{const logo=await loadImage(brand.logo),ratio=Math.min(270/logo.width,120/logo.height);ctx.drawImage(logo,(1080-logo.width*ratio)/2,82,logo.width*ratio,logo.height*ratio);}catch{}
  ctx.textAlign='center';ctx.fillStyle='white';ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=8;ctx.font='500 30px sans-serif';ctx.fillText('To. '+($('#recipient').value||'親愛的好友'),540,260);ctx.shadowBlur=0;
  const panelX=90,panelWidth=900,padX=62,innerWidth=panelWidth-padX*2;
  const verseText=copy.verse?'「'+copy.verse+'」':copy.blessing;
  ctx.font='600 43px "Noto Serif TC",serif';const verseLines=wrapParagraphs(ctx,verseText,innerWidth),verseLineHeight=64;
  ctx.font='400 28px sans-serif';const referenceLines=copy.reference?wrapParagraphs(ctx,'— '+copy.reference,innerWidth):[],referenceLineHeight=40;
  const blessingText=copy.verse?copy.blessing:'';
  ctx.font='500 31px sans-serif';const blessingLines=wrapParagraphs(ctx,blessingText,innerWidth),blessingLineHeight=48;
  const gapAfterVerse=copy.reference||blessingLines.length?22:0,gapAfterReference=blessingLines.length?24:0;
  const panelHeight=padX*2+verseLines.length*verseLineHeight+gapAfterVerse+referenceLines.length*referenceLineHeight+gapAfterReference+blessingLines.length*blessingLineHeight;
  const panelY=Math.max(315,Math.min(500,Math.round((1000-panelHeight)/2+350)));
  ctx.fillStyle='rgba(255,253,248,.94)';roundedRect(ctx,panelX,panelY,panelWidth,panelHeight,34);ctx.fill();
  let y=panelY+padX+42;ctx.textAlign='left';ctx.fillStyle='#19483f';ctx.font='600 43px "Noto Serif TC",serif';
  for(const line of verseLines){ctx.fillText(line,panelX+padX,y);y+=verseLineHeight;}
  y+=gapAfterVerse;
  if(referenceLines.length){ctx.textAlign='right';ctx.fillStyle='#73847e';ctx.font='400 28px sans-serif';for(const line of referenceLines){ctx.fillText(line,panelX+panelWidth-padX,y);y+=referenceLineHeight;}}
  y+=gapAfterReference;
  if(blessingLines.length){ctx.beginPath();ctx.moveTo(panelX+padX,y-8);ctx.lineTo(panelX+panelWidth-padX,y-8);ctx.strokeStyle='#dbe9e3';ctx.lineWidth=2;ctx.stroke();y+=24;ctx.textAlign='left';ctx.fillStyle='#46675e';ctx.font='500 31px sans-serif';for(const line of blessingLines){ctx.fillText(line,panelX+padX,y);y+=blessingLineHeight;}}
  ctx.textAlign='center';ctx.fillStyle='white';ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=7;ctx.font='700 31px sans-serif';ctx.fillText(brand.name,540,1190);ctx.textAlign='right';ctx.font='400 25px sans-serif';ctx.fillText('— '+($('#signature').value||profile.name)+' 的誠摯祝福',970,1240);ctx.shadowBlur=0;
  return canvas.toDataURL('image/jpeg',.92);
}
async function shareLove(item){const button=$('#share'),status=$('#share-status');button.disabled=true;status.textContent='正在製作專屬祝福卡…';try{const image=await composeCard(item),url=await uploadShare(image);canvasUrl=url;if(!window.liff?.isApiAvailable?.('shareTargetPicker'))throw new Error('share_unavailable');const result=await window.liff.shareTargetPicker([{type:'image',originalContentUrl:url,previewImageUrl:url}]);status.textContent=result?'祝福已送出 💛':'已取消選擇好友。';}catch(error){if(error.message==='rate_limited')status.textContent='一小時內製作次數已達上限，請稍後再試。';else if(canvasUrl&&navigator.share){await navigator.share({title:'教會祝福卡',url:canvasUrl}).catch(()=>{});status.textContent='已開啟手機分享選單。';}else status.textContent='目前無法開啟好友選擇，請稍後再試或先下載圖卡。';}finally{button.disabled=false;}}

async function render(){setConnection('為你準備內容中…');if(current==='menu'){menu();setConnection('願平安與你同在');return;}payload=await call(current);profile=payload.profile||profile;setConnection('願今天滿有恩典');if(current==='today')todayPage(payload);if(current==='help')helpPage(payload);if(current==='weekly')weeklyPage(payload);if(current==='love')lovePage(payload);}
function cleanEntry(church=config?.church||'M+',feature=current||'menu'){const url=new URL('line-member.html',location.origin+location.pathname);url.searchParams.set('church',church);url.searchParams.set('feature',feature);url.searchParams.set('entry','20261009-clean-state5');return url.href;}
function showError(error,stage='content'){content.replaceChildren($('#error-template').content.cloneNode(true));const code={config:'L01',sdk:'L02',login:'L03',credential:'L04',api:'L05',content:'L06'}[stage]||'L00',detail=content.querySelector('[data-error-detail]'),retry=content.querySelector('[data-error-retry]');if(detail)detail.textContent=`連線階段：${code}`;if(retry)retry.onclick=()=>location.replace(cleanEntry());setConnection('連線尚未完成');console.error('line-member',stage,error);}
async function start(){let stage='config';try{config=lineConfig(location.search);applyBrand();current=featureFromLocation();$('#home').onclick=()=>route('menu');window.onpopstate=()=>{current=featureFromLocation();render().catch(error=>showError(error,'content'));};stage='sdk';if(!window.liff?.init)throw new Error('liff_sdk_unavailable');await Promise.race([window.liff.init({liffId:config.liffId}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('line_login_timeout')),15000))]);config=lineConfig(location.search);current=featureFromLocation();applyBrand();stage='login';if(!window.liff.isLoggedIn()){if(window.liff.isInClient?.())throw new Error('line_client_login_incomplete');window.liff.login({redirectUri:cleanEntry(config.church,current)});return;}stage='credential';idToken=window.liff.getIDToken?.()||'';accessToken=window.liff.getAccessToken?.()||'';if(!idToken&&!accessToken)throw new Error('missing_token');stage='api';const base=await call('menu');profile=base.profile||profile;if(['prayer','newcomer','today','tree','devotional','service_signup'].includes(current)){openFeature(current);return;}route(current,{replace:true});}catch(error){showError(error,stage);}}
start();
