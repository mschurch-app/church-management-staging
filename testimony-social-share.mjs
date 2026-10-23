const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function storyPermalink(id){if(!UUID.test(String(id)))throw Error('invalid_story');return 'https://mchurch.online/?testimony='+encodeURIComponent(id)+'#testimonies';}
export function storyShareLinks(story){const url=storyPermalink(story.id);return {url,facebook:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url),line:'https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(story.title)};}
function drawLines(ctx,text,x,y,width,height,max){
 const lines=[];let line='';for(const c of Array.from(String(text).replace(/\s+/g,' '))){if(ctx.measureText(line+c).width>width&&line){lines.push(line);line=c;}else line+=c;}if(line)lines.push(line);
 lines.slice(0,max).forEach((line,i)=>ctx.fillText(i===max-1&&lines.length>max?line.slice(0,-1)+'…':line,x,y+i*height));return Math.min(lines.length,max)*height;
}
export async function createShareCard(story){
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');if(!c)throw Error('card_unavailable');
 c.fillStyle='#faf8f1';c.fillRect(0,0,1080,1350);c.fillStyle='#193f35';c.fillRect(0,0,1080,20);c.fillStyle='#7b5934';c.font='600 30px -apple-system, sans-serif';c.fillText('雲彩見證  ·  M+ CHURCH',88,120);
 c.fillStyle='#193f35';c.font='600 58px -apple-system, sans-serif';const titleHeight=drawLines(c,story.title,88,235,904,82,5);
 c.strokeStyle='#cbd6c7';c.lineWidth=2;c.beginPath();c.moveTo(88,255+titleHeight);c.lineTo(992,255+titleHeight);c.stroke();
 c.font='36px -apple-system, sans-serif';c.fillStyle='#28493e';const excerptY=330+titleHeight,maxLines=Math.max(2,Math.floor((1100-excerptY)/60));drawLines(c,story.body,88,excerptY,904,60,maxLines);
 c.font='30px -apple-system, sans-serif';c.fillText(String(story.display_name||'匿名分享').slice(0,30),88,1190);c.fillStyle='#53675b';c.font='26px -apple-system, sans-serif';c.fillText('閱讀完整見證  ·  mchurch.online',88,1270);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('card_unavailable');return new File([blob],'mplus-testimony.png',{type:'image/png'});
}
export function createStoryShares(story){
 const links=storyShareLinks(story),root=node('section',null,'testimony-shares');root.setAttribute('aria-label','分享這篇見證');root.append(node('p','分享這篇見證','testimony-shares__label'));
 const actions=node('div',null,'testimony-shares__actions');
 for(const [name,key] of [['Facebook','facebook'],['LINE','line']]){const a=node('a',name);a.href=links[key];a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','分享這篇見證至 '+name+'（另開視窗）');actions.append(a);}
 const ig=node('button','IG');ig.type='button';ig.setAttribute('aria-label','分享這篇見證至 Instagram');actions.insertBefore(ig,actions.lastChild);root.append(actions);
 const dialog=node('dialog',null,'testimony-share-dialog'),h=node('h3','分享到 Instagram'),hint=node('p','先複製文字與連結，再開啟手機分享選單選擇 Instagram；也可下載圖卡後自行貼文或限時動態。'),preview=node('img'),caption=node('textarea'),status=node('p',null,'testimony-share-status'),controls=node('div',null,'testimony-shares__actions');
 const titleId='ig-share-'+story.id;h.id=titleId;dialog.setAttribute('aria-labelledby',titleId);caption.readOnly=true;caption.setAttribute('aria-label','分享文字與連結');caption.value=story.title+'\n'+story.display_name+'｜雲彩見證\n\n'+story.body.slice(0,300)+(story.body.length>300?'…':'')+'\n\n閱讀完整見證：\n'+links.url;
 preview.alt='這篇見證的 Instagram 分享圖卡';preview.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const copy=node('button','複製文字與連結'),native=node('button','開啟手機分享'),download=node('a','下載分享圖'),close=node('button','關閉');for(const b of [copy,native,close])b.type='button';native.disabled=true;download.hidden=true;download.download='mplus-testimony.png';controls.append(copy,native,download);dialog.append(h,hint,preview,caption,controls,status,close);root.append(dialog);
 let file=null,objectUrl=null,generation=0;
 const cleanup=()=>{generation++;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;file=null;preview.removeAttribute('src');preview.hidden=true;download.hidden=true;native.disabled=true;};
 dialog.addEventListener('close',()=>{cleanup();if(ig.isConnected)ig.focus({preventScroll:true});});close.onclick=()=>dialog.close();
 copy.onclick=async()=>{try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(caption.value);status.textContent='已複製文字與連結，可貼到 IG。';}catch{caption.focus();caption.select();status.textContent='請長按或按 ⌘C 複製上方文字與連結。';}};
 native.onclick=async()=>{if(!file)return;try{await navigator.share({files:[file]});status.textContent='分享選單已完成；請在 Instagram 確認貼文內容。';}catch(error){status.textContent=error.name==='AbortError'?'已取消分享，可再次開啟或下載圖卡。':'無法開啟分享選單，請下載圖卡後在 IG 發佈。';}};
 download.onclick=()=>{status.textContent='已交由瀏覽器下載圖卡；請在 IG 選取圖卡並貼上文字。';};
 ig.onclick=async()=>{dialog.showModal();status.textContent='正在準備分享圖卡…';const ticket=++generation;try{const result=await createShareCard(story);if(!dialog.open||ticket!==generation)return;file=result;objectUrl=URL.createObjectURL(file);preview.src=objectUrl;preview.hidden=false;download.href=objectUrl;download.hidden=false;native.disabled=!(navigator.share&&navigator.canShare?.({files:[file]}));status.textContent=native.disabled?'此瀏覽器請使用「下載分享圖」，再到 IG 發佈。':'圖卡已準備好，請先複製文字，再開啟分享選單選 Instagram。';}catch{if(dialog.open&&ticket===generation)status.textContent='圖卡暫時無法產生，仍可複製文字與連結。';}};
 return root;
}
