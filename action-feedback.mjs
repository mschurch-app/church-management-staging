if(!window.__churchActionFeedbackInstalled){
window.__churchActionFeedbackInstalled=true;
const state={lastInteraction:0};
const ownedButtons=new Map();
let toast,icon,copy,timer,watchdog;

function ensure(){
  if(toast)return;
  toast=document.createElement('div');toast.className='os-action-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.innerHTML='<span class="os-action-icon"></span><span class="os-action-copy"></span>';
  icon=toast.querySelector('.os-action-icon');copy=toast.querySelector('.os-action-copy');document.body.append(toast);
  const style=document.createElement('style');style.textContent=`
  .os-action-toast{position:fixed;z-index:2147483646;right:18px;bottom:calc(var(--app-dock-height,64px) + env(safe-area-inset-bottom) + 16px);display:flex;max-width:min(420px,calc(100vw - 28px));min-height:54px;align-items:center;gap:11px;padding:12px 16px;border:1px solid rgba(255,255,255,.38);border-radius:17px;background:#183f38;color:#fff;box-shadow:0 18px 48px rgba(25,39,35,.28);font:750 14px/1.45 system-ui,-apple-system,"Noto Sans TC",sans-serif;opacity:0;transform:translateY(18px) scale(.98);pointer-events:none;transition:.2s ease;backdrop-filter:blur(18px)}
  .os-action-toast.show{opacity:1;transform:none}.os-action-toast.success{background:#176c62}.os-action-toast.error{background:#a53b2c}.os-action-toast.warning{background:#71481c}.os-action-toast.busy{background:var(--app-accent,#173f34)}.os-action-icon{display:grid;width:28px;height:28px;flex:0 0 28px;place-items:center;border-radius:50%;background:rgba(255,255,255,.18);font-size:15px}.os-action-toast.busy .os-action-icon{font-size:0}.os-action-toast.busy .os-action-icon:after{content:"";width:13px;height:13px;border:2px solid rgba(255,255,255,.38);border-top-color:#fff;border-radius:50%;animation:os-spin .75s linear infinite}@keyframes os-spin{to{transform:rotate(360deg)}}
  button.os-action-busy{position:relative;opacity:.82;cursor:wait!important}button.os-action-busy:after{content:"";display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:os-spin .7s linear infinite}
  @media(max-width:760px){.member-page>.page-nav{width:auto!important;max-width:calc(100% - 20px);min-width:0;margin-right:10px!important;margin-left:10px!important}}
  @media(max-width:620px){.os-action-toast{right:14px;bottom:calc(var(--app-dock-height,64px) + env(safe-area-inset-bottom) + 12px);left:14px;max-width:none}}
  @media(prefers-reduced-motion:reduce){.os-action-toast{transition:none}.os-action-toast.busy .os-action-icon:after,button.os-action-busy:after{animation:none}}
  `;document.head.append(style);
}
function show(message,type='busy',duration=0){if(!message)return;ensure();clearTimeout(timer);toast.className=`os-action-toast ${type} show`;icon.textContent=type==='success'?'✓':['error','warning'].includes(type)?'!':'';copy.textContent=message;if(duration)timer=setTimeout(()=>toast.classList.remove('show'),duration);}
function clearButtons(){for(const [button,original]of ownedButtons){button.classList.remove('os-action-busy');if(original===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',original);}ownedButtons.clear();}
function classify(message,node){
 const tone=node?.dataset?.tone;
 if(['error','success','busy','working','warning'].includes(tone))return tone==='working'?'busy':tone;
 if(node?.classList?.contains('error')||/失敗|無法|錯誤|未完成|尚未|未儲存|未更新|未上傳|未刪除|登入失效/.test(message))return'error';
 if(/正在|處理中|載入中|產生中|製作中|上傳中|儲存中|更新中|準備中|請稍候/.test(message))return'busy';
 // Only mirror an explicit result from the page. Never infer success from a
 // response status, elapsed time, or the generic words「完成／成功」.
 if(/已儲存|儲存完成|已更新|更新完成|已上傳|上傳完成|已刪除|已移除|已建立|已寄送|已發布|已上稿|已送審|已送出/.test(message))return'success';
 return'';
}
function begin(button){
 state.lastInteraction=Date.now();clearTimeout(watchdog);clearButtons();
 if(button){ownedButtons.set(button,button.getAttribute('aria-busy'));button.classList.add('os-action-busy');button.setAttribute('aria-busy','true');}
 // A short operation needs only local feedback. Slow work gets a neutral
 // explanation; a timer cannot establish whether the write succeeded.
 watchdog=setTimeout(()=>{clearButtons();show('仍未收到操作結果。請先查看原紀錄，避免重複送出。','warning',9000);},20000);
}
function recoverUnexpected(){if(Date.now()-state.lastInteraction>60000)return;clearTimeout(watchdog);clearButtons();show('尚無法確認操作結果。請先查看原紀錄，已填內容請保留。','warning',9000);}
function watchStatus(root=document){for(const node of root.querySelectorAll?.('[role="status"],.status-message,.app-status,.form-message')||[])if(node!==toast&&!node.closest?.('.os-action-toast,[data-action-feedback="off"]')&&!node.dataset.actionFeedbackWatched){node.dataset.actionFeedbackWatched='1';new MutationObserver(()=>{if(Date.now()-state.lastInteraction>60000||node.hidden||node.getAttribute('aria-live')==='off'||!node.getClientRects().length)return;const message=(node.textContent||'').trim(),type=classify(message,node);if(!type)return;if(type!=='busy'){clearTimeout(watchdog);clearButtons();}else return;show(message,type,type==='error'?7000:type==='success'?3500:9000);}).observe(node,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','hidden','data-tone']});}}
function install(){ensure();watchStatus();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches?.('[role="status"],.status-message,.app-status,.form-message'))watchStatus(node.parentElement||document);else watchStatus(node);}}).observe(document.body,{childList:true,subtree:true});
 window.addEventListener('error',recoverUnexpected);window.addEventListener('unhandledrejection',recoverUnexpected);
 document.addEventListener('submit',event=>{const form=event.target;if(event.defaultPrevented||!(form instanceof HTMLFormElement)||form.closest('[data-action-feedback="off"]')||!form.checkValidity())return;begin(form.querySelector('button[type="submit"],input[type="submit"]'));},true);
 document.addEventListener('click',event=>{if(event.defaultPrevented)return;const button=event.target.closest('button');if(!button||button.disabled||button.closest('[data-action-feedback="off"]')||!/(儲存|保存|更新|重新|上傳|下載|匯出|列印|刪除|移除|封存|報廢|發布|發佈|上稿|送出|寄送|歸還|借出|修正)/.test(button.textContent||''))return;if(button.closest('form')&&(button.type===''||button.type==='submit'))return;begin(button);},true);
}

// Fetch is deliberately untouched. The page owns timeouts, business validation,
// completion, retries and whether a print/download was actually opened.

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

}
