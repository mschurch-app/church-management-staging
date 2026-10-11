const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search);
const step=Math.max(1,Math.min(4,Number(params.get('workflow_step'))||1));
const currentId=params.get('bulletin')||'';
const labels=['日期與草稿','週報文字','三款圖卡','預覽送審'];
const $id=id=>document.getElementById(id);
const setText=(node,text)=>{if(node)node.textContent=text;};
let operating=false;
function syncButtons(root,c){
  const state=c.state(),locked=operating||state.working||state.needsRefresh;
  root.querySelectorAll('[data-progress]').forEach(node=>node.disabled=locked||Number(node.dataset.progress)>=step);
  root.querySelectorAll('.wizard-current-page input,.wizard-current-page textarea,.wizard-current-page select').forEach(node=>node.disabled=locked||(step>1&&!state.editable));
  $id('wizard-back').disabled=locked||step===1;
  $id('wizard-next').disabled=locked||(step>1&&!state.editable)||(step===3&&!root.querySelector('[name="canva-design"]:checked'));
  root.querySelectorAll('[data-wizard-save]').forEach(node=>node.disabled=locked||!state.editable);
}
async function operate(root,c,task){
  if(operating||c.state().working||c.state().needsRefresh)return;
  operating=true;root.setAttribute('aria-busy','true');setText($id('wizard-feedback'),'正在處理，請稍候…');syncButtons(root,c);
  try{await task();}catch(error){setText($id('wizard-message')||$id('wizard-note'),error.message||'尚未完成，內容仍保留在本頁。');}
  finally{operating=false;root.removeAttribute('aria-busy');setText($id('wizard-feedback'),'');syncButtons(root,c);}
}
async function saveAndGo(root,c,target){
  await operate(root,c,async()=>{
    if(step===3&&$id('reel-caption'))$id('reel-caption').value=$id('wizard-caption').value.trim();
    if(c.state().editable&&!await c.save())throw new Error($id('status').textContent||'尚未儲存，請留在本頁重試。');
    setPage(target,currentRow(c).id);
  });
}
function setPage(step,id){
  const next=new URL(location.href);
  next.searchParams.set('workflow_step',String(step));
  if(id)next.searchParams.set('bulletin',id);else next.searchParams.delete('bulletin');
  location.assign(next.href);
}
function buildShell(){
  const root=document.createElement('section');
  root.id='weekly-wizard';
  root.innerHTML='<header class="wizard-top"><div class="wizard-kicker">SUNDAY BULLETIN · 教會週報</div><h2>一步一步完成主日週報</h2><p>每頁完成一件事；草稿會先儲存，最後確認後才送審。</p><p id="wizard-date-context" class="wizard-date-context"></p><div class="wizard-progress" aria-label="週報製作進度"></div></header><section class="wizard-current-page"></section><footer class="wizard-footer"><button id="wizard-back" type="button" class="wizard-secondary">上一步</button><span id="wizard-feedback" role="status" aria-live="polite"></span><button id="wizard-next" type="button" class="wizard-primary">下一步</button></footer>';
  root.querySelector('.wizard-progress').innerHTML=labels.map((label,index)=>'<button type="button" class="wizard-progress-step" data-progress="'+(index+1)+'"><i>'+(index+1)+'</i><b>'+label+'</b></button>').join('<span class="wizard-progress-line" aria-hidden="true"></span>');
  return root;
}
function progress(root){
  root.querySelectorAll('[data-progress]').forEach(node=>{
    const n=Number(node.dataset.progress);
    node.classList.toggle('is-current',n===step);
    node.classList.toggle('is-complete',n<step);
    node.setAttribute('aria-current',n===step?'step':'false');
  });
}
function moveOut(el,target){if(el&&target)target.append(el);}
function currentRow(c){return c.getCurrent()||{};}
function dateValue(c){return $id('service-date').value||currentRow(c).service_date||'';}
function editCaption(c){return $id('reel-caption')?.value||currentRow(c).reel_caption||'';}
function captionText(c){
  const church=params.get('church'),topic=$id('sermon-topic').value.trim()||$id('bulletin-title').value.trim();
  return [topic,$id('bulletin-subtitle').value.trim(),$id('sermon-scripture').value.trim()?'經文｜'+$id('sermon-scripture').value.trim():'',$id('sermon-speaker').value.trim()?'講員｜'+$id('sermon-speaker').value.trim():'','主日｜'+dateValue(c),'',church==='M+'?'#Mplus大雅教會 #主日信息 #台中教會':'#火樂教會 #主日信息'].filter((line,index)=>line!==''||index===5).join('\n');
}
function makeStepOne(root,c){
  const page=root.querySelector('.wizard-current-page');
  page.innerHTML='<div class="wizard-page-heading"><span>STEP 01</span><h3>先選擇主日日期與週報來源</h3><p>可以從空白週報開始，或複製一份既有週報再修改。</p></div><div class="wizard-start-card"><label class="wizard-field"><span>主日日期</span><input id="wizard-date" type="date" required></label><fieldset class="wizard-mode"><legend>這次要怎麼開始？</legend><label><input type="radio" name="wizard-mode" value="blank" checked><span><b>建立空白週報</b><small>從基本資料開始輸入</small></span></label><label><input type="radio" name="wizard-mode" value="copy"><span><b>複製既有週報</b><small>沿用文字與週報段落，再更新本週內容</small></span></label><label><input type="radio" name="wizard-mode" value="edit"><span><b>繼續編輯草稿</b><small>接續尚未完成的週報</small></span></label><label id="wizard-source-wrap" hidden><span id="wizard-source-label">選擇週報</span><select id="wizard-source"></select></label></fieldset><p id="wizard-note" class="wizard-message" role="status"></p></div>';
  const rows=c.getBulletins()||[],date=$id('wizard-date');
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+(7-d.getDay())%7);
  const suggested=d.toISOString().slice(0,10);
  const used=new Set(rows.map(row=>row.service_date));let next=suggested;for(let i=0;i<60&&used.has(next);i++){const parts=next.split('-').map(Number),later=new Date(parts[0],parts[1]-1,parts[2]+7,12);next=later.getFullYear()+'-'+String(later.getMonth()+1).padStart(2,'0')+'-'+String(later.getDate()).padStart(2,'0');}date.value=currentId?currentRow(c).service_date||next:next;
  date.onchange=()=>{$id('service-date').value=date.value;setText($id('wizard-date-context'),date.value);};
  const select=$id('wizard-source'),sourceWrap=$id('wizard-source-wrap');
  function syncChoice(){
    const mode=page.querySelector('[name="wizard-mode"]:checked').value;
    sourceWrap.hidden=mode==='blank';
    $id('wizard-source-label').textContent=mode==='edit'?'選擇要繼續編輯的草稿':'選擇要複製的週報';
    const choices=mode==='edit'?rows.filter(r=>['draft','changes_requested'].includes(r.status)):rows.filter(r=>['draft','changes_requested','published'].includes(r.status));
    select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='請選擇';select.append(empty);
    choices.forEach(row=>{const o=document.createElement('option');o.value=row.id;o.textContent=row.service_date+'｜'+(row.title||'主日週報');select.append(o);});
  }
  select.onchange=()=>{if(page.querySelector('[name="wizard-mode"]:checked').value==='edit'){const row=rows.find(r=>r.id===select.value);if(row)date.value=row.service_date;}};
  page.querySelectorAll('[name="wizard-mode"]').forEach(r=>r.onchange=syncChoice);syncChoice();
  if(currentId){const selected=rows.find(row=>row.id===currentId&&['draft','changes_requested'].includes(row.status));if(selected){page.querySelector('[name="wizard-mode"][value="edit"]').checked=true;syncChoice();select.value=selected.id;date.value=selected.service_date;}}
  root.querySelector('#wizard-back').disabled=true;
  root.querySelector('#wizard-next').textContent='開始編輯 →';
  root.querySelector('#wizard-next').onclick=()=>operate(root,c,async()=>{
    try{
      const mode=page.querySelector('[name="wizard-mode"]:checked').value,chosen=date.value;
      if(!chosen)throw new Error('請先選擇主日日期。');
      if(mode==='edit'){
        if(!c.can('edit'))throw new Error('目前帳號沒有編輯草稿的權限。');
        const row=rows.find(item=>item.id===select.value);if(!row)throw new Error('請選擇要繼續編輯的草稿。');
        await c.open(row,{force:true});$id('service-date').value=chosen;$id('service-date').dispatchEvent(new Event('change',{bubbles:true}));
      }else if(mode==='copy'){
        if(!c.can('create'))throw new Error('目前帳號沒有建立週報的權限。');
        const row=rows.find(item=>item.id===select.value);if(!row)throw new Error('請選擇要複製的週報。');
        await c.copy(row,chosen);
      }else{
        if(!c.can('create'))throw new Error('目前帳號沒有建立週報的權限。');
        await c.open(null,{force:true});$id('service-date').value=chosen;$id('service-date').dispatchEvent(new Event('change',{bubbles:true}));
      }
      const ok=await c.save();if(!ok)throw new Error($id('status').textContent||'草稿尚未儲存。');
      setPage(2,currentRow(c).id);
    }catch(error){setText($id('wizard-note'),error.message||'無法建立週報，請確認後再試。');}
  });
}
function moveTextContent(root){
  const page=root.querySelector('.wizard-current-page'),form=$id('bulletin-form'),grid=form.querySelector('.website-form-grid');
  page.innerHTML='<div class="wizard-page-heading"><span>STEP 02</span><h3>整理本週週報文字</h3><p>填好主日資訊與週報內容，按下一步會先儲存成草稿。</p></div><div class="wizard-text-group" id="wizard-text-fields"></div><div class="wizard-content-group" id="wizard-schedule"></div><div class="wizard-content-group" id="wizard-sections"></div><details class="wizard-more"><summary>IG Reel、YouTube 與發布設定</summary><div id="wizard-media-settings"></div></details><p id="wizard-message" class="wizard-message" role="status"></p>';
  const text=page.querySelector('#wizard-text-fields');
  for(const id of ['bulletin-title','sermon-topic','bulletin-subtitle','sermon-scripture','sermon-speaker','service-time']){
    const node=$id(id);if(!node)continue;const label=node.closest('label');if(label)text.append(label);else text.append(node);
  }
  const friendly={'bulletin-title':'週報標題','sermon-topic':'主日信息主題','bulletin-subtitle':'副標／週報開場文字','sermon-scripture':'聖經經文','sermon-speaker':'講員','service-time':'主日時間'};
  text.querySelectorAll('label').forEach(label=>{const control=label.querySelector('input,textarea,select');if(control&&friendly[control.id])label.dataset.wizardTitle=friendly[control.id];});
  moveOut($id('schedule-preview'),page.querySelector('#wizard-schedule'));
  moveOut($id('sections'),page.querySelector('#wizard-sections'));
  const heading=$id('weekly-content');if(heading){const desc=heading.nextElementSibling;if(desc)page.querySelector('#wizard-sections').prepend(desc);heading.remove();}
  moveOut($id('reel-panel'),page.querySelector('#wizard-media-settings'));
  moveOut($id('weekly-youtube'),page.querySelector('#wizard-media-settings'));
  const reelCaption=$id('reel-caption')?.closest('label');if(reelCaption)page.querySelector('#wizard-media-settings').append(reelCaption);
  if(grid)grid.hidden=true;
}
function makeStepTwo(root,c){
  moveTextContent(root);
  root.querySelector('#wizard-back').onclick=()=>saveAndGo(root,c,1);
  root.querySelector('#wizard-next').textContent='儲存草稿並繼續 →';
  root.querySelector('#wizard-next').onclick=()=>operate(root,c,async()=>{
    const status=$id('wizard-message');status.textContent='';
    try{
      if(!$id('bulletin-title').value.trim())throw new Error('請輸入週報標題。');
      if(!$id('sermon-topic').value.trim())throw new Error('請輸入主日信息主題。');
      if(!$id('sermon-scripture').value.trim())throw new Error('請輸入聖經經文。');
      if(!$id('sermon-speaker').value.trim())throw new Error('請輸入講員。');
      if($id('reel-caption'))$id('reel-caption').value=editCaption(c);
      const ok=await c.save();if(!ok)throw new Error($id('status').textContent||'草稿尚未儲存。');
      setPage(3,currentRow(c).id);
    }catch(error){status.textContent=error.message||'儲存未完成，內容仍保留在本頁。';}
  });
}
function makeStepThree(root,c){
  const page=root.querySelector('.wizard-current-page'),form=$id('bulletin-form'),grid=form.querySelector('.website-form-grid');
  page.innerHTML='<div class="wizard-page-heading"><span>STEP 03</span><h3>產生三款圖卡，挑選最合適的一款</h3><p>每款都會包含官網橫圖和 IG 直圖。生成期間可查看進度。</p></div><div class="wizard-card" id="wizard-canva"></div><div class="wizard-image-preview"><h4>本週圖卡</h4><div class="canva-preview-grid"></div></div><label class="wizard-caption"><span>Instagram 貼文文字（可修改）</span><textarea id="wizard-caption" maxlength="2200" rows="7"></textarea><small>文字會一起儲存在週報草稿中，最後一步可再次核對。</small></label>';
  const canva=grid?.querySelector('#weekly-canva');
  if(canva)page.querySelector('#wizard-canva').append(canva);
  const promo=grid?.querySelector('#promo-state');if(promo)page.querySelector('#wizard-canva').append(promo);
  const preview=grid?.querySelector('.canva-preview-grid');if(preview)page.querySelector('.wizard-image-preview .canva-preview-grid').replaceWith(preview);
  const consent=document.createElement('label');consent.className='wizard-consent';consent.innerHTML='<input id="canva-ai-consent" type="checkbox"><span>同意將本週主題、經文、講員和日期傳給 Canva AI 製作圖卡。</span>';
  $id('canva-generate')?.before(consent);
  const nextButton=root.querySelector('#wizard-next');nextButton.disabled=true;
  if(currentRow(c).hero_image_path&&currentRow(c).reel_cover_image_path){
    const keep=document.createElement('label');keep.className='wizard-consent';keep.innerHTML='<input type="radio" name="canva-design" value="saved" checked><span>保留已儲存的本週圖卡</span>';page.querySelector('.wizard-image-preview').prepend(keep);
  }
  root.addEventListener('change',event=>{if(event.target?.matches('[name="canva-design"]'))syncButtons(root,c);});
  const options=document.createElement('div');options.id='canva-options';options.className='canva-options';options.hidden=true;options.addEventListener('change',event=>{if(event.target?.matches('input[name="canva-design"]'))nextButton.disabled=false;});$id('canva-state')?.after(options);
  const caption=$id('wizard-caption');caption.value=editCaption(c)||captionText(c);caption.oninput=()=>{if($id('reel-caption'))$id('reel-caption').value=caption.value;};
  root.querySelector('#wizard-back').onclick=()=>saveAndGo(root,c,2);
  root.querySelector('#wizard-next').textContent='套用所選圖卡並繼續 →';
  root.querySelector('#wizard-next').onclick=()=>operate(root,c,async()=>{
    try{
      const selected=root.querySelector('input[name="canva-design"]:checked');
      if(!selected)throw new Error('請完成 Canva 製圖，並選擇一款設計。');
      if(selected.value!=='saved'&&!await c.useCanvaOption(Number(selected.value)))throw new Error('圖卡尚未套用，請再試一次。');
      if($id('reel-caption'))$id('reel-caption').value=caption.value.trim();
      const ok=await c.save();if(!ok)throw new Error($id('status').textContent||'圖卡尚未保存，請留在此頁重新嘗試。');
      setPage(4,currentRow(c).id);
    }catch(error){setText($id('wizard-message'),error.message||'圖卡尚未完成，請稍後再試。');}
  });
  const message=document.createElement('p');message.id='wizard-message';message.className='wizard-message';message.setAttribute('role','status');page.append(message);
}
function renderPreview(c,root){
  const page=root.querySelector('.wizard-current-page'),row=currentRow(c),section=page.querySelector('#wizard-preview-content');
  section.replaceChildren();
  const top=document.createElement('div');top.className='wizard-preview-heading';
  const date=document.createElement('span');date.className='wizard-preview-date';date.textContent=row.service_date||dateValue(c);
  const title=document.createElement('h4');title.textContent=row.title||$id('bulletin-title').value;top.append(date,title);
  const info=document.createElement('section');info.className='wizard-preview-info';
  for(const [label,value] of [['信息主題',$id('sermon-topic').value],['副標',$id('bulletin-subtitle').value],['經文',$id('sermon-scripture').value],['講員',$id('sermon-speaker').value],['主日時間',$id('service-time').value]])if(value.trim()){const p=document.createElement('p'),b=document.createElement('b');b.textContent=label+'｜';p.append(b,document.createTextNode(value));info.append(p);}
  section.append(top,info);
  const body=document.createElement('div');body.className='wizard-preview-sections';
  (row.sections||[]).filter(item=>item.enabled!==false&&!item.auto_schedule).forEach(item=>{const card=document.createElement('article'),h=document.createElement('h4');h.textContent=item.title;card.append(h);if(item.description){const description=document.createElement('p');description.textContent=item.description;card.append(description);}(item.items||[]).filter(line=>line.label||line.body).forEach(line=>{const p=document.createElement('p');if(line.label){const b=document.createElement('b');b.textContent=line.label+'｜';p.append(b);}p.append(document.createTextNode(line.body||''));card.append(p);});body.append(card);});
  section.append(body);
  const schedule=$id('schedule-preview')?.cloneNode(true);if(schedule){schedule.removeAttribute('id');schedule.hidden=false;const h=document.createElement('h4');h.textContent='主日服事安排';section.append(h,schedule);}
  const art=document.createElement('div');art.className='wizard-review-art';
  for(const [label,id] of [['官網橫式圖','image-preview'],['Instagram 直式圖','reel-cover-preview']]){const fig=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');caption.textContent=label;const source=$id(id);if(source?.src)img.src=source.src;img.alt=label;fig.append(img,caption);art.append(fig);}
  section.append(art);
  const caption=document.createElement('section');caption.className='wizard-review-caption';const h=document.createElement('h4');h.textContent='Instagram 貼文文字';const p=document.createElement('p');p.textContent=editCaption(c);caption.append(h,p);section.append(caption);
}
function makeStepFour(root,c){
  const page=root.querySelector('.wizard-current-page');
  page.innerHTML='<div class="wizard-page-heading"><span>STEP 04</span><h3>整體預覽，確認後送審</h3><p>請核對主日內容、服事安排、官網與 IG 圖卡，以及 Instagram 文字。</p></div><div class="wizard-review-sheet" id="wizard-preview-content"></div><div class="wizard-review-note">只有按下「送交審核」並確認後，系統才會通知審核同工。</div><p id="wizard-message" class="wizard-message" role="status"></p>';
  renderPreview(c,root);
  moveOut($id('submit-progress'),page);moveOut($id('submit-state'),page);
  root.querySelector('#wizard-back').onclick=()=>saveAndGo(root,c,3);
  root.querySelector('#wizard-next').textContent='送交牧師、師母審核 →';
  root.querySelector('#wizard-next').onclick=()=>operate(root,c,()=>c.requestReview());
  const actions=$id('weekly-actions');if(actions)actions.hidden=true;
}
async function boot(){
  const c=window.weeklyBulletinController;if(!c){setTimeout(boot,150);return;}
  try{
    await c.ready;
    if(!c.isReady())return;
    if(step>1&&!currentId){setPage(1,'');return;}
    const row=(c.getBulletins()||[]).find(item=>item.id===currentId);
    if(step>1&&!row){setText($id('status'),'找不到這份週報，請重新選擇。');setPage(1,'');return;}
    if(currentId&&row&&currentRow(c).id!==currentId)await c.open(row,{force:true});
    const root=buildShell();const form=$id('bulletin-form');
    // Keep original fields and handlers available while mounting just one page.
    const parked=document.createElement('div');parked.id='wizard-original-fields';parked.hidden=true;
    parked.append(...Array.from(form.children));form.append(parked);form.noValidate=true;
    form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();if(!$id('wizard-next').disabled)$id('wizard-next').click();},true);
    const side=document.querySelector('.bulletin-list');if(side)side.hidden=true;
    document.querySelector('.website-scope')?.setAttribute('hidden','');
    $id('scope-note')?.setAttribute('hidden','');
    $id('workflow').hidden=true;document.querySelector('.website-preview-disclosure').hidden=true;
    form.querySelector('#editor-title').hidden=true;$id('draft-state').hidden=true;form.querySelector('.workflow-section-nav').hidden=true;
    $id('weekly-actions').hidden=true;form.prepend(root);$id('weekly-editor-panel').classList.add('wizard-active');
    progress(root);setText($id('wizard-date-context'),step===1?'':(currentRow(c).service_date||''));
    root.querySelector('.wizard-kicker').textContent=(params.get('church')==='M+'?'M+大雅教會':'火樂教會')+' · SUNDAY BULLETIN';
    $id('page-title').textContent=labels[step-1]+' · '+(params.get('church')==='M+'?'M+大雅教會':'火樂教會');$id('page-description').textContent='第 '+step+' 步，共 4 步。完成此頁後可儲存並前往下一頁。';
    if(step===1)makeStepOne(root,c);
    else if(step===2)makeStepTwo(root,c);
    else if(step===3)makeStepThree(root,c);
    else makeStepFour(root,c);
    const editorGrid=form.querySelector('.website-form-grid');if(editorGrid)editorGrid.hidden=true;
    root.querySelector('#wizard-back').onclick=root.querySelector('#wizard-back').onclick||(()=>setPage(step-1,currentId));
    if(step===1)root.querySelector('#wizard-back').disabled=true;
    root.querySelectorAll('[data-progress]').forEach(node=>{const n=Number(node.dataset.progress);node.disabled=n>=step;node.title=n<step?'返回'+labels[n-1]:'尚未完成此步驟';if(n<step)node.onclick=()=>saveAndGo(root,c,n);});
    if(step===4){const save=document.createElement('button');save.type='button';save.className='wizard-secondary';save.textContent='儲存草稿';save.dataset.wizardSave='';save.onclick=()=>operate(root,c,async()=>{const ok=await c.save();setText($id('wizard-message'),ok?'草稿已儲存。':$id('status').textContent);});root.querySelector('.wizard-footer').insertBefore(save,root.querySelector('#wizard-next'));}
    window.addEventListener('weekly-bulletin-state',()=>syncButtons(root,c));syncButtons(root,c);
  }catch(error){setText($id('status'),error.message||'週報流程無法載入，請重新整理。');}
}
boot();
