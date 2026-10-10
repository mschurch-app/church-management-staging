const ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-canva';
const ERRORS={
  configuration_required:'請管理員先完成 Canva 連線設定。',connection_required:'Canva 授權已失效，請管理員重新連線。',
  connection_busy:'Canva 正在更新連線，請稍後繼續查詢。',manager_required:'這項設定需要週報審核管理員處理。',
  forbidden:'目前帳號沒有操作這份週報的權限。',login_required:'登入已失效，請先儲存輸入內容，再重新登入。',
  templates_required:'請先選擇預告圖與 IG 圖模板。',template_fields_required:'模板尚未設定主題、經文、講員與日期欄位，請管理員調整模板。',
  template_dimensions:'模板尺寸不符：預告圖需 16:9，IG 圖需 9:16。請調整模板後重新產生。',
  information_required:'請先填寫主題、經文、講員和主日日期。',rate_limited:'目前製圖次數較多，請稍後再試。',
  canva_access_denied:'Canva 尚未授權使用此模板或功能，請管理員確認帳號方案與授權。',
  creation_unknown:'尚無法確認 Canva 建立結果。請先到 Canva 查看，再決定是否重新產生，避免重複建立。',
  bulletin_locked:'週報已送審或發布，無法更換圖片。',not_found:'找不到這筆製圖工作，請重新選擇週報。',
  autofill_failed:'Canva 填版失敗，原有圖片已保留。請檢查模板後重新產生。',export_failed:'Canva 匯出失敗，原有圖片已保留。可重新匯出設計。',
  image_save_failed:'圖片尚未保存，請繼續查詢以重試保存。',job_save_failed:'製圖進度尚未確認，請繼續查詢。',
};
const message=error=>ERRORS[error?.code]||error?.message||'Canva 暫時無法使用，輸入內容與原有圖片已保留。';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sameInput=(a,b)=>['TOPIC','SCRIPTURE','SPEAKER','SERVICE_DATE','SUBTITLE','SERVICE_TIME'].every(key=>a?.[key]===b?.[key]);
const STAGES={queued:'等候填版',creating:'建立設計',autofill:'填入主日資訊',design_ready:'準備匯出',exporting:'建立匯出工作',export:'匯出圖片',ready:'圖片已保存'};

export function initWeeklyCanva({db,church,getContext,run,onImages,onStatus}){
  let settings=null,job=null,pendingId='',pendingRequest=null,connectionWindow=null,templateContinuation=null,continuing=false;
  const key=()=>`weekly-canva:${getContext().userId}:${church}:${getContext().bulletinId}`;
  const status=text=>{$('canva-state').textContent=text;};
  function savePending(id,request){pendingId=id;pendingRequest=request;try{sessionStorage.setItem(key(),JSON.stringify({id,request}));}catch{};}
  function storedPending(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
  function renderJob(updateStatus=true){
    $('canva-resume').hidden=!pendingId;
    $('canva-refresh-images').hidden=!job||!Object.values(job.outputs).every(o=>o.designId);
    for(const kind of ['home','ig'])$('canva-edit-'+kind).hidden=!job?.outputs?.[kind]?.designId;
    if(job&&updateStatus){status(job.status==='blocked'?message({code:job.error}):Object.entries(job.outputs).map(([kind,o])=>`${kind==='home'?'預告圖':'IG 圖'}：${STAGES[o.stage]||'處理中'}`).join(' · '));}
  }
  function sync(){
    const context=getContext(),ready=settings?.configured&&settings?.connected&&settings?.templates?.default?.home&&settings?.templates?.default?.ig;
    $('canva-generate').disabled=!context.editable||context.busy||!ready;
    $('canva-resume').disabled=!context.editable||context.busy||!pendingId;
    $('canva-refresh-images').disabled=!context.editable||context.busy||!job||!Object.values(job.outputs).every(o=>o.designId);
    $('canva-connect').hidden=!settings?.canManage;
    $('canva-connect').disabled=context.busy||!settings?.configured;
    $('canva-template-settings').hidden=!settings?.canManage||!settings?.connected;
    for(const id of ['canva-template-theme','canva-home-template','canva-ig-template','canva-save-templates','canva-load-templates'])$(id).disabled=context.busy||!settings?.canManage||!settings?.connected;
    $('canva-check-connection').disabled=context.busy;
    for(const kind of ['home','ig'])$('canva-edit-'+kind).disabled=context.busy||!context.editable;
    $('canva-connection').textContent=!settings?'Canva 連線狀態尚未確認':!settings.configured?'Canva 尚未完成連線設定，請管理員協助。':!settings.connected?'請先連結教會的 Canva 帳號。':!ready?'Canva 已連線，請選擇預告圖與 IG 圖模板。':'Canva 已連線，可以製作本週圖片。';
    $('canva-connect').textContent=settings?.connected?'重新連結 Canva':'連結 Canva';
    $('canva-load-templates').textContent=templateContinuation?'載入更多模板':'重新載入模板';
    renderJob(false);
  }
  async function request(action,body={}){
    const session=await db.auth.getSession(),jwt=session.data.session?.access_token;
    if(!jwt)throw Object.assign(new Error(ERRORS.login_required),{code:'login_required'});
    const response=await fetch(ENDPOINT,{method:'POST',credentials:'omit',cache:'no-store',headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify({action,church,...body}),signal:AbortSignal.timeout(45000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Object.assign(new Error(ERRORS[data.error]||'Canva 暫時無法使用，請稍後繼續查詢。'),{code:data.error});
    return data;
  }
  async function load(){
    try{
      settings=await request('status');
      const selected=$('canva-template-theme').value||'default';
      $('canva-template-theme').replaceChildren(...settings.themes.map(theme=>new Option(theme.label,theme.id)));
      $('canva-template-theme').value=selected;
      sync();if(settings.connected&&settings.canManage)await loadTemplates();
    }
    catch(error){status(message(error));sync();}
  }
  async function loadTemplates(){
    const data=await request('templates',{continuation:templateContinuation||''});
    for(const kind of ['home','ig']){
      const select=$('canva-'+kind+'-template'),chosen=select.value||settings.templates?.[$('canva-template-theme').value]?.[kind]||'';
      if(!templateContinuation)select.replaceChildren(new Option('選擇 Canva 品牌模板',''));
      for(const item of data.items)if(![...select.options].some(o=>o.value===item.id))select.add(new Option(item.title||item.id,item.id));
      if(chosen&&![...select.options].some(o=>o.value===chosen))select.add(new Option('目前使用的模板',chosen));
      select.value=chosen;
    }
    templateContinuation=data.continuation;sync();
    if(!data.items.length&&!templateContinuation)status('尚未找到可填版的品牌模板，請先在 Canva 設定兩種尺寸的模板。');
  }
  async function acceptImages(){
    const context=getContext();
    if(!context.editable||job.bulletinId!==context.bulletinId||!sameInput(job.input,context.input))throw new Error('主日資訊已變更，請依最新內容重新產圖；已完成的 Canva 設計仍可查看。');
    const outputs=job.outputs;
    const results=await Promise.all(['home','ig'].map(async kind=>{
      const path=outputs[kind]?.path,prefix=`${church}/weekly/${context.bulletinId}/canva/`;
      if(typeof path!=='string'||!path.startsWith(prefix))throw new Error('圖片資料尚未完整，請繼續查詢。');
      const result=await db.storage.from('church-website-public-media').download(path);
      if(result.error||!result.data)throw new Error('圖片預覽暫時無法載入，請繼續查詢。');
      return result.data;
    }));
    // Publish neither preview until both images have downloaded successfully.
    await onImages({home:results[0],ig:results[1]});
    status('兩張 Canva 圖片已帶入預覽，請儲存週報後送審。');
    onStatus('Canva 預告圖與 IG 圖已完成，請確認預覽並儲存週報。','success');
  }
  async function poll(){
    if(continuing)return;continuing=true;
    try{
      const started=Date.now();
      while(Date.now()-started<90000){
        const context=getContext();
        if(job?.bulletinId&&job.bulletinId!==context.bulletinId)throw new Error('已切換週報，請回原週報繼續查看製圖結果。');
        const data=await request('advance',{jobId:pendingId});job=data.job;renderJob();
        if(job.status==='ready'){await acceptImages();return;}
        if(job.status==='blocked'){onStatus(message({code:job.error}),'error');return;}
        await sleep(1500);
      }
      status('Canva 仍在處理，可按「繼續查詢」接續，不需重新產生。');
    }catch(error){status(message(error)+' 可按「繼續查詢」確認同一筆工作。');onStatus(message(error),'error');}
    finally{continuing=false;}
  }
  async function generate(reexport=false){
    const context=getContext();
    if(!context.editable)return;
    if(!['TOPIC','SCRIPTURE','SPEAKER','SERVICE_DATE'].every(k=>context.input[k]))throw new Error(ERRORS.information_required);
    const parent=job?.id,requestId=crypto.randomUUID();
    if(reexport&&(!parent||!sameInput(job.input,context.input)))throw new Error('主日資訊已變更，請重新產圖。');
    const action=reexport?'reexport':'start',payload={requestId,bulletinId:context.bulletinId,input:context.input,...(reexport?{parentJobId:parent}:{})};
    savePending(requestId,{action,payload});job=null;renderJob();status(reexport?'正在重新匯出 Canva 設計…':'正在建立本週 Canva 製圖工作…');
    // start/reexport only create an idempotent database job. They do not create remote designs.
    const data=await request(action,payload);
    job=data.job;status(`使用${job.input.TEMPLATE_THEME||'通用'}情境模板，正在製作兩種尺寸…`);await poll();
  }
  async function resume(){
    if(!pendingId)return;
    let data;
    try{data=await request('get',{jobId:pendingId});}
    catch(error){
      if(error.code!=='not_found'||!pendingRequest)throw error;
      // Retry the same database-only start ID if its original response was lost.
      data=await request(pendingRequest.action,pendingRequest.payload);
    }
    job=data.job;renderJob();
    if(job.status==='ready')await acceptImages();else if(job.status==='working')await poll();else onStatus(message({code:job.error}),'error');
  }
  async function authorize(){
    // Open synchronously with the click, before any async work, so Safari allows it.
    connectionWindow=window.open('about:blank','church-canva-connection','width=800,height=750');
    if(!connectionWindow)throw new Error('請允許此網站開啟 Canva 授權視窗，再按一次連結。');
    try{const result=await request('authorize');const url=new URL(result.authorizationUrl);if(url.origin!=='https://www.canva.com')throw new Error('授權連結不正確。');connectionWindow.location.replace(url.href);status('請在 Canva 視窗完成授權，原本週報輸入會保留。');}
    catch(error){connectionWindow.close();connectionWindow=null;throw error;}
  }
  const act=fn=>run(async()=>{try{await fn();}catch(error){status(message(error));onStatus(message(error),'error');}});
  $('canva-generate').onclick=()=>act(()=>generate());
  $('canva-resume').onclick=()=>act(resume);
  $('canva-refresh-images').onclick=()=>act(()=>generate(true));
  $('canva-connect').onclick=()=>act(authorize);
  $('canva-check-connection').onclick=()=>act(async()=>{templateContinuation=null;await load();});
  $('canva-template-theme').onchange=()=>{
    const pair=settings.templates?.[$('canva-template-theme').value]||{};
    for(const kind of ['home','ig']){
      const select=$('canva-'+kind+'-template'),id=pair[kind]||'';
      if(id&&![...select.options].some(o=>o.value===id))select.add(new Option('目前使用的模板',id));
      select.value=id;
    }
  };
  // These controls save separate Canva settings, not weekly bulletin content.
  $('canva-template-settings').addEventListener('input',event=>event.stopPropagation());
  $('canva-template-settings').addEventListener('change',event=>event.stopPropagation());
  $('canva-load-templates').onclick=()=>act(loadTemplates);
  $('canva-save-templates').onclick=()=>act(async()=>{
    status('正在確認模板欄位…');
    const data=await request('save_templates',{theme:$('canva-template-theme').value,homeTemplate:$('canva-home-template').value,igTemplate:$('canva-ig-template').value});
    settings.templates=data.templates;status('兩種 Canva 模板已儲存。');sync();
  });
  for(const kind of ['home','ig'])$('canva-edit-'+kind).onclick=()=>act(async()=>{
    const tab=window.open('about:blank','_blank');
    if(!tab)throw new Error('請允許開啟 Canva 視窗後再試。');
    tab.opener=null;
    try{const data=await request('edit_link',{jobId:job.id,kind});const url=new URL(data.url);if(url.origin!=='https://www.canva.com')throw new Error('Canva 設計連結不正確。');tab.location.replace(url.href);status('在 Canva 儲存修改後，回來按「帶回 Canva 最新圖片」。');}catch(error){tab.close();throw error;}
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==connectionWindow||event.data?.type!=='church-canva-connected')return;
    connectionWindow=null;templateContinuation=null;
    act(async()=>{await load();status(event.data.result==='connected'?'Canva 授權已完成，請設定兩種圖片模板。':'Canva 授權未完成，請重新連結。');});
  });
  return {sync,load,reset(){job=null;const saved=storedPending();pendingId=saved?.id||'';pendingRequest=saved?.request||null;status(pendingId?'這份週報有製圖紀錄，可繼續查詢結果。':'');renderJob();sync();}};
}
