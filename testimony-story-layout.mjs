import {buildStoryPresentation,resolveStoryPresentation} from './testimony-layout-plan.mjs?v=20261023-layout1';
import {resolveStoryIllustrations} from './testimony-illustrations.mjs?v=20261024-story2';
import {createStoryShares} from './testimony-social-share.mjs?v=20261024-story2';
// Shared by the public website and the private review preview. Content stays plain text.
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};

export function storyParagraphs(body=''){
 return buildStoryPresentation(body).paragraphs.map(r=>String(body).slice(r.start,r.end));
}

export function storyLayout(body='',media=[],presentation){
 const plan=resolveStoryPresentation(body,media,presentation),paragraphs=plan.paragraphs.map(r=>String(body).slice(r.start,r.end)),slots=new Map();
 media.forEach((m,index)=>{
  if(!m||!['photo','video'].includes(m.kind)||typeof m.url!=='string'||!/^https?:\/\//i.test(m.url))return;
  const placement=plan.placements[index],gap=placement.after;
  if(!slots.has(gap))slots.set(gap,[]);slots.get(gap).push({...m,order:index,style:placement.style});
 });
 for(const m of resolveStoryIllustrations(plan)){if(!slots.has(m.after))slots.set(m.after,[]);slots.get(m.after).push(m);}
 return {paragraphs,slots};
}

function figure(media,title){
 const figure=node('figure',null,'testimony-story__figure');
 if(media.kind==='illustration'){
  figure.classList.add('testimony-story__figure--'+media.style,'testimony-story__figure--illustration');
  const img=node('img');img.src=media.url;img.alt=media.alt;img.loading='lazy';img.decoding='async';figure.append(img,node('figcaption',media.caption));
  img.addEventListener('error',()=>{img.hidden=true;figure.prepend(node('span','示意插圖暫時無法載入。','testimony-story__media-error'));},{once:true});
 }else if(media.kind==='video'){
  figure.classList.add('testimony-story__figure--wide');
  const video=node('video');video.src=media.url;video.controls=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',title+'的分享影片');figure.append(video);
 }else{
  figure.classList.add('testimony-story__figure--'+media.style);
  const link=node('a'),img=node('img');link.href=media.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','放大第 '+(media.order+1)+' 張分享照片（另開視窗）');
  img.src=media.url;img.alt=title+'的分享照片 '+(media.order+1);img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{img.hidden=true;link.append(node('span','照片暫時無法載入，點此查看原檔。','testimony-story__media-error'));},{once:true});
  link.append(img);figure.append(link);
 }
 return figure;
}

export function createStoryArticle(story,{header=true,sharing=false}={}){
 const article=node('article',null,'testimony-story'),flow=node('div',null,'testimony-story__flow'),{paragraphs,slots}=storyLayout(story.body,story.media||[],story.presentation);
 if(header){
  const head=node('header',null,'testimony-story__header');
  head.append(node('p',story.category||'生命分享','testimony-story__category'),node('h2',story.title,'testimony-story__title'),node('p',story.display_name||'匿名分享','testimony-story__byline'));article.append(head);
 }
 if(sharing)article.append(createStoryShares(story));
 const appendMedia=index=>{
  const group=slots.get(index)||[];
  if(group.length>1){const pair=node('div',null,'testimony-story__pair');for(const m of group)pair.append(figure(m,story.title));flow.append(pair);}
  else if(group.length)flow.append(figure(group[0],story.title));
 };
 paragraphs.forEach((text,index)=>{flow.append(node('p',text,'testimony-story__paragraph'));appendMedia(index);});
 if(!paragraphs.length)appendMedia(0);
 article.append(flow);return article;
}

export function bindStoryDialog(dialog,{sharing=false}={}){
 let opener=null;
 dialog.querySelector('[data-story-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{dialog.querySelectorAll('video').forEach(video=>video.pause());dialog.querySelector('[data-story-body]').replaceChildren();document.body.classList.remove('testimony-reading-open');if(opener?.isConnected)opener.focus({preventScroll:true});});
 return (story,trigger=document.activeElement)=>{
  opener=trigger;dialog.querySelector('[data-story-body]').replaceChildren(createStoryArticle(story,{sharing}));dialog.showModal();dialog.scrollTop=0;document.body.classList.add('testimony-reading-open');
 };
}
