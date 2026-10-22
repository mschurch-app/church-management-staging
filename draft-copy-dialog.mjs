const node=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const safeName=value=>String(value||'草稿').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80);

// A read-only copy. The caller verifies current identity, permission and source before opening and downloading.
export function createDraftCopyDialog(){
 let current=null;
 function close(){if(!current)return;const {dialog,bodyStyle,focus,position}=current;current=null;dialog.close();dialog.remove();Object.assign(document.body.style,bodyStyle);window.scrollTo({top:position,behavior:'instant'});const target=typeof focus==='function'?focus():focus;if(target?.isConnected)target.focus({preventScroll:true});}
 function open({title,text,data,filename,verify,returnFocus}){
  close();const dialog=node('dialog','','draft-copy-dialog'),heading=node('h2',title),description=node('p','這份內容僅供檢視、複製與另存，不會套用、覆寫正式紀錄或送出通知。'),label=node('label','草稿內容'),content=node('textarea'),status=node('p','','draft-copy-status'),actions=node('div','','draft-copy-actions'),select=node('button','全選文字','secondary'),download=node('button','下載文字副本','secondary'),full=node('button','下載完整副本','secondary'),done=node('button','關閉','secondary');
  heading.id='draft-copy-title';dialog.setAttribute('aria-labelledby',heading.id);dialog.dataset.actionFeedback='off';content.readOnly=true;content.value=text;content.rows=16;content.setAttribute('aria-label','草稿內容');status.setAttribute('role','status');
  for(const control of [select,download,full,done]){control.type='button';control.dataset.appControl='surface';}
  label.append(content);actions.append(select,download,full,done);dialog.append(heading,description,label,actions,status);document.body.append(dialog);
  const instance={dialog,bodyStyle:{overflow:document.body.style.overflow,position:document.body.style.position,top:document.body.style.top,width:document.body.style.width},focus:returnFocus||document.activeElement,position:window.scrollY,busy:false};current=instance;
  Object.assign(document.body.style,{overflow:'hidden',position:'fixed',top:-instance.position+'px',width:'100%'});
  select.onclick=()=>{content.focus();content.select();status.textContent='已全選，可使用系統的複製功能。';};
  const save=async json=>{
   if(current!==instance||instance.busy)return;instance.busy=true;dialog.setAttribute('aria-busy','true');download.disabled=full.disabled=true;status.textContent='正在確認副本與下載權限…';
   try{await verify();if(current!==instance)return;const blob=new Blob([json?JSON.stringify(data,null,2)+'\n':text],{type:json?'application/json;charset=utf-8':'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=safeName(filename)+(json?'.json':'.txt');document.body.append(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}status.textContent='已準備下載，請確認瀏覽器的下載紀錄。完整副本保留欄位資料，不能直接匯入或自動合併。';}
   catch(error){if(current===instance)status.textContent=error.message||'副本尚未下載，請重新確認後再試。';}
   finally{instance.busy=false;if(current===instance){dialog.setAttribute('aria-busy','false');download.disabled=full.disabled=false;}}
  };
  download.onclick=()=>void save(false);full.onclick=()=>void save(true);done.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();done.focus();
 }
 return {open,close};
}

export function sermonCopyText(payload,{source,baseVersion}={}){
 const info=payload.information,lines=['信息草稿副本',source==='device'?'來源：這台裝置尚未送出的副本':'來源：目前頁面內容','基準版本：'+baseVersion,'此副本未送出，不代表正式保存或 NAS 備份。','',`主題：${info.title}`,`經文：${info.scripture}`,`講員：${info.speaker}`,`聚會日期：${info.service_date}`,`對象：${payload.audience}`,`聖經版本：${payload.bible_version}`,`正文目標：${payload.target_characters}`,'','領受與筆記',payload.notes,'','素材'];
 for(const [index,material]of payload.materials.entries())lines.push(`${index+1}. ${material.title}`,`講員：${material.speaker}`,`來源：${material.url||'自己的素材'}`,`已核對：${material.reviewed?'是':'否'}`,material.content,'領受與筆記：'+material.note,'');
 lines.push('信息大綱',...payload.outline,'已確認大綱：'+(payload.outline_confirmed?'是':'否'),'','完整講章',payload.manuscript,'','來源與待查證',...payload.source_checklist,'','投影片');
 for(const [index,slide]of payload.slides.entries())lines.push(`第 ${index+1} 頁：${slide.title}`,slide.content,'講員備註：'+slide.notes,'');
 return lines.join('\n');
}

export function scheduleCopyText(fields,{church,labels={}}={}){
 return ['排班草稿副本','堂會：'+(church==='M+'?'M＋大雅教會':'火樂教會'),'這份副本未儲存正式排班，舊欄位仍需人工核對。','',...Object.entries(fields).map(([key,value])=>(key==='service_date'?'聚會日期':key==='event'?'聚會主題':labels[key]||key)+'：'+value)].join('\n');
}
