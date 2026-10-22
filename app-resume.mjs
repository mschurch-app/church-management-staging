// Restore the existing document first. Never resubmit work or touch Auth storage.
const RELOAD_KEY='church-os-resume-reload';
const POSITION_KEY='church-os-resume-position';
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const callbackPage=()=>/(?:auth|login|callback|handoff|launch|payment|line-pay|linepay|checkout)/i.test(location.pathname)||/(?:code|transactionId|handoff|church_session|access_token|refresh_token)=/i.test(location.search+location.hash);
function hasContent(){
  const root=document.querySelector('main,[role="main"]')||document.body;
  if(!root)return false;
  const visible=node=>{const css=getComputedStyle(node);return css.display!=='none'&&css.visibility!=='hidden'&&css.visibility!=='collapse'&&Number(css.opacity)!==0&&node.getClientRects().length>0;};
  if(!visible(root))return false;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let text,count=0;(text=walker.nextNode())&&count++<2000;){
    if(!text.textContent.trim()||text.parentElement.closest('script,style,template,[hidden],[aria-hidden="true"]'))continue;
    if(!visible(text.parentElement))continue;
    const range=document.createRange();range.selectNodeContents(text);
    if([...range.getClientRects()].some(rect=>rect.width&&rect.height))return true;
  }
  return [...root.querySelectorAll('input,textarea,select,button,img,video,canvas,svg')].some(visible);
}
export function installResumeRecovery({hasDraft,isBusy}){
  if(window.__churchResumeInstalled)return;window.__churchResumeInstalled=true;
  let hidden=false,hadContent=false,hadProtectedWork=false,nonFormEdited=false,timer=0,restoreFromCache=false,returned=false;
  // Store only the current URL and scroll offset, never form values or sessions.
  try{const saved=JSON.parse(sessionStorage.getItem(POSITION_KEY)||'null');sessionStorage.removeItem(POSITION_KEY);if(saved?.url===location.pathname+location.search+location.hash&&Date.now()-saved.at<60000){let restoring=true;const stop=()=>restoring=false;document.addEventListener('pointerdown',stop,{once:true});document.addEventListener('keydown',stop,{once:true});let observer;const restore=()=>{if(restoring)window.scrollTo(0,saved.y);};if('ResizeObserver'in window){observer=new ResizeObserver(restore);observer.observe(document.body);}requestAnimationFrame(restore);setTimeout(()=>{observer?.disconnect();document.removeEventListener('pointerdown',stop);document.removeEventListener('keydown',stop);},5000);}}catch{}
  const protectedWork=()=>nonFormEdited||hasDraft()||isBusy()||!!document.querySelector('dialog[open],[role="dialog"]:not([hidden]),input[type="file"]:focus');
  function reloadOnce(){
    if(navigator.onLine===false||hadProtectedWork||protectedWork()||callbackPage())return false;
    // Storage failure must not turn a recovery into a reload loop.
    try{const last=JSON.parse(sessionStorage.getItem(RELOAD_KEY)||'null');
      if(last&&Date.now()-last.at<10000)return false;
      sessionStorage.setItem(RELOAD_KEY,JSON.stringify({at:Date.now()}));
      sessionStorage.setItem(POSITION_KEY,JSON.stringify({at:Date.now(),url:location.pathname+location.search+location.hash,y:scrollY}));
    }catch{return false;}
    location.reload();return true;
  }
  function recover(){
    if(document.hidden)return;
    const persisted=restoreFromCache,fromBackground=returned;restoreFromCache=false;returned=false;
    // A layout/repaint nudge preserves form values, focus and scroll position.
    const body=document.body;if(!body)return;
    const marker=document.createElement('span');marker.setAttribute('aria-hidden','true');
    marker.style.cssText='position:fixed;inset:0;pointer-events:none;outline:1px solid transparent;z-index:-1';
    body.append(marker);void marker.getBoundingClientRect();
    requestAnimationFrame(()=>requestAnimationFrame(()=>marker.remove()));
    window.dispatchEvent(new Event('resize'));
    // WebKit can show a blank surface while the DOM and layout remain intact.
    // Cover ordinary foreground returns as well as BFCache; never replay writes.
    if((persisted||fromBackground)&&isIOS()&&reloadOnce())return;
    if(hadContent&&!hasContent()){
      if(reloadOnce())return;
      // Keep existing drafts/operations intact; offer an explicit recovery route.
      if(!document.querySelector('[data-resume-recovery]')){
        const panel=document.createElement('aside');panel.dataset.resumeRecovery='true';
        panel.style.cssText='position:fixed;inset:auto 16px calc(24px + env(safe-area-inset-bottom));z-index:2147483646;padding:20px;border:1px solid #d6dfda;border-radius:18px;background:#fff;color:#173e35;font:16px system-ui;box-shadow:0 8px 32px #0002';
        const text=document.createElement('p');text.setAttribute('role','status');text.textContent=hadProtectedWork||protectedWork()?'畫面尚未恢復。已保留此頁內容，請確認目前操作後再重新整理。':'畫面尚未恢復，請重新整理。';
        const button=document.createElement('button');button.type='button';button.textContent='重新整理';button.style.cssText='min-height:44px;padding:8px 20px';button.onclick=()=>{if(protectedWork()){if(isBusy()){text.textContent='目前操作尚未完成，請等候結果，避免重複送出。';return;}if(!confirm('還有尚未儲存的修改。要放棄修改並重新載入嗎？'))return;window.dispatchEvent(new Event('church:discard-drafts'));document.querySelectorAll('[data-unsaved-changes="true"]').forEach(node=>node.dataset.unsavedChanges='false');}location.reload();};
        panel.append(text,button);body.append(panel);
      }
    }else document.querySelector('[data-resume-recovery]')?.remove();
    window.dispatchEvent(new Event('church:foreground'));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(recover,300);}
  function leave(){if(hidden)return;hidden=true;hadContent=hasContent();hadProtectedWork=protectedWork();clearTimeout(timer);}
  for(const type of ['input','change'])document.addEventListener(type,event=>{if(!event.target.closest('form'))nonFormEdited=true;},true);
  function enter(){if(document.hidden||!hidden)return;hidden=false;returned=true;schedule();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();else enter();});
  window.addEventListener('pagehide',leave);
  window.addEventListener('pageshow',event=>{if(event.persisted){hidden=false;restoreFromCache=true;schedule();}else enter();});
  window.addEventListener('blur',leave);window.addEventListener('focus',enter);
}
