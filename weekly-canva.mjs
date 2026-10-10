const ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-canva';
const ERRORS={
  configuration_required:'請管理員先完成 Canva 連線設定。',connection_required:'Canva 授權已失效，請管理員重新連線。',
  connection_busy:'Canva 正在更新連線，請稍後繼續查詢。',manager_required:'這項設定需要週報審核管理員處理。',
  forbidden:'目前帳號沒有操作這份週報的權限。',login_required:'登入已失效，請先儲存輸入內容，再重新登入。',
  template_dimensions:'Canva 圖片尺寸不符，請在 Canva 確認橫式 1600×900、直式 1080×1920，再重新匯出。',
  credit_quota_exceeded:'教會 Canva 帳號的 AI 額度已用完，請待額度恢復後再產生。已完成設計與原有圖片會保留。',
  credit_quota_cooldown:'Canva AI 額度目前暫停使用，請稍後再試。已完成設計會保留。',
  ai_not_available:'Canva 尚未開放此帳號使用 AI 設計生成介面，請確認 Canva 帳號、團隊權限與開發者應用資格。',
  resize_not_available:'Canva 帳號尚無調整尺寸權限。可先開啟已生成的設計，請管理員確認方案與權限。',
  generation_failed:'Canva AI 未完成此次設計。原有圖片已保留；重新產生會再次使用 AI 額度。',
  content_not_allowed:'Canva 未接受這次製圖內容，請調整主日資訊後再產生。',
  single_page_required:'Canva AI 產生了多頁設計，尚未帶入週報。請先開啟 Canva 檢視，再決定是否重新產生單頁圖片。',
  resize_failed:'Canva 未完成尺寸調整，已生成的設計仍可開啟查看，原有週報圖片已保留。',
  canva_job_expired:'Canva 工作已失效或無法存取，請先查看已生成的設計，再決定是否重新產生。',
  invalid_canva_request:'Canva AI 尚未接受這次製圖要求，請管理員確認目前介面支援狀況。原有圖片已保留。',
  ai_consent_required:'請重新整理後，使用「Canva AI 生成本週全新宣傳圖」按鈕。',
  information_required:'請先填寫主題、經文、講員和主日日期。',rate_limited:'目前製圖次數較多，請稍後再試。',
  canva_access_denied:'Canva 尚未授權使用此模板或功能，請管理員確認帳號方案與授權。',
  creation_unknown:'尚無法確認 Canva 建立結果。請先到 Canva 查看，再決定是否重新產生，避免重複建立。',
  bulletin_locked:'週報已送審或發布，無法更換圖片。',not_found:'找不到這筆製圖工作，請重新選擇週報。',
  autofill_failed:'先前的 Canva 填版工作未完成，請改用 Canva AI 重新產生。',export_failed:'Canva 匯出失敗，原有圖片已保留。可重新匯出設計。',
  image_save_failed:'圖片尚未保存，請繼續查詢以重試保存。',job_save_failed:'製圖進度尚未確認，請繼續查詢。',
};
const message=error=>ERRORS[error?.code]||error?.message||'Canva 暫時無法使用，輸入內容與原有圖片已保留。';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sameInput=(a,b)=>['TOPIC','SCRIPTURE','SPEAKER','SERVICE_DATE','SUBTITLE','SERVICE_TIME'].every(key=>a?.[key]===b?.[key]);
const STAGES={queued:'等候創作',creating:'送出 AI 創作',generating:'Canva AI 正在創作',generated:'核對單頁設計',resizing:'送出尺寸調整',resize:'Canva 正在調整尺寸',autofill:'處理先前填版工作',design_ready:'準備匯出',exporting:'建立匯出工作',export:'匯出圖片',ready:'圖片已保存'};

export function initWeeklyCanva({db,church,getContext,run,onImages,onStatus}){
  let settings=null,job=null,pendingId='',pendingRequest=null,connectionWindow=null,continuing=false;
  const key=()=>`weekly-canva:${getContext().userId}:${church}:${getContext().bulletinId}`;
  const status=text=>{$('canva-state').textContent=text;};
  function savePending(id,request){pendingId=id;pendingRequest=request;try{sessionStorage.setItem(key(),JSON.stringify({id,request}));}catch{};}
  function storedPending(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
  function renderJob(updateStatus=true){
    $('canva-resume').hidden=!pendingId;
    $('canva-refresh-images').hidden=!job?.canReexport;
    for(const kind of ['home','ig'])$('canva-edit-'+kind).hidden=!job?.outputs?.[kind]?.designId;
    if(job&&updateStatus){status(job.status==='blocked'?message({code:job.error}):Object.entries(job.outputs).map(([kind,o])=>`${kind==='home'?'預告圖':'IG 圖'}：${STAGES[o.stage]||'處理中'}`).join(' · '));}
  }
  function sync(){
    const context=getContext(),ready=settings?.configured&&settings?.connected&&settings?.mode==='canva_ai';
    $('canva-generate').disabled=!context.editable||context.busy||!ready;
    $('canva-resume').disabled=!context.editable||context.busy||!pendingId;
    $('canva-refresh-images').disabled=!context.editable||context.busy||!job?.canReexport;
    $('canva-connect').hidden=!settings?.canManage;
    $('canva-connect').disabled=context.busy||!settings?.configured;
    $('canva-check-connection').disabled=context.busy;
    for(const kind of ['home','ig'])$('canva-edit-'+kind).disabled=context.busy||!context.editable;
    $('canva-connection').textContent=!settings?'Canva 連線狀態尚未確認':!settings.configured?'Canva 尚未完成連線設定，請管理員協助。':!settings.connected?'請先連結教會的 Canva 帳號。':'Canva 已連線，可送出本週 AI 製圖要求。';
    $('canva-connect').textContent=settings?.connected?'重新連結 Canva':'連結 Canva';
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
    try{settings=await request('status');sync();}
    catch(error){status(message(error));sync();}
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
    status('兩張 Canva 圖片已帶入預覽，請核對主題、經文、講員、日期與直式排版，儲存後送審。');
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
        await sleep(Math.min(30000,Math.max(1500,Number(job.retryAfterMs)||1500)));
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
    const action=reexport?'reexport':'start',payload={requestId,bulletinId:context.bulletinId,input:context.input,...(reexport?{parentJobId:parent}:{aiConsent:true})};
    savePending(requestId,{action,payload});job=null;renderJob();status(reexport?'正在重新匯出 Canva 設計…':'正在建立本週 Canva 製圖工作…');
    // start/reexport only create an idempotent database job. They do not create remote designs.
    const data=await request(action,payload);
    job=data.job;status(reexport?'正在匯出已儲存的 Canva 設計，不會再次呼叫 AI 生成。':'Canva AI 正依據本週信息創作兩張全新設計，會使用教會 Canva 帳號的 AI 額度…');await poll();
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
  $('canva-check-connection').onclick=()=>act(load);
  for(const kind of ['home','ig'])$('canva-edit-'+kind).onclick=()=>act(async()=>{
    const tab=window.open('about:blank','_blank');
    if(!tab)throw new Error('請允許開啟 Canva 視窗後再試。');
    tab.opener=null;
    try{const data=await request('edit_link',{jobId:job.id,kind});const url=new URL(data.url);if(url.origin!=='https://www.canva.com')throw new Error('Canva 設計連結不正確。');tab.location.replace(url.href);status('在 Canva 儲存修改後，回來按「帶回 Canva 最新圖片」。');}catch(error){tab.close();throw error;}
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==connectionWindow||event.data?.type!=='church-canva-connected')return;
    connectionWindow=null;
    act(async()=>{await load();status(event.data.result==='connected'?'Canva 授權已完成，可送出本週 AI 製圖要求。':'Canva 授權未完成，請重新連結。');});
  });
  return {sync,load,reset(){job=null;const saved=storedPending();pendingId=saved?.id||'';pendingRequest=saved?.request||null;status(pendingId?'這份週報有製圖紀錄，可繼續查詢結果。':'');renderJob();sync();}};
}
