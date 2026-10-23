import {draftGuard,lockControls,uncertainWrite} from './app-workflow.mjs?v=20261022-experience2';

// Content editors share feedback and draft protection; the page owns authorization and writes.
export function contentWorkflow({db,read,apply,clear,reset,sync=()=>{}}){
  const root=document.body,status=document.querySelector('#status'),drafts=new Map();
  let busy=false,ready=false,epoch=0,identity=null;
  const message=text=>{status.textContent=text;root.querySelectorAll('[data-editor-result]').forEach(n=>{n.textContent=text;n.hidden=!text;});};
  const update=()=>{root.querySelectorAll('[data-write]').forEach(n=>n.disabled=busy||!ready);sync(ready&&!busy);};
  function forget(form){drafts.get(form)?.dispose();drafts.delete(form);}
  function track(form){for(const old of drafts.keys())if(!old.isConnected)forget(old);forget(form);drafts.set(form,draftGuard(form));}
  function canLeave(){return !busy&&(![...drafts.values()].some(g=>g.dirty)||confirm('還有尚未儲存的修改。要放棄這些修改並切換嗎？'));}
  function discard(){for(const guard of drafts.values())guard.clear();reset();}
  async function refresh(ticket,ack=''){
    try{const result=await read();if(ticket!==epoch)return;ready=true;apply(result);message(ack||'資料已載入。');}
    catch(error){if(ticket!==epoch)return;ready=false;clear();message(ack?ack+' 清單暫時無法更新，請重新載入確認，勿重複送出。':error.message||'資料暫時無法載入，請重新載入。');}
  }
  async function load(){
    if(!canLeave())return;discard();busy=true;ready=false;const ticket=++epoch,unlock=lockControls(root);message('正在確認權限並載入…');
    try{await refresh(ticket);}finally{unlock();busy=false;update();}
  }
  async function write(task,ack,done=discard){
    if(busy||!ready)return;busy=true;const ticket=epoch,unlock=lockControls(root);message('正在儲存，請稍候…');
    try{await task();if(ticket!==epoch)return;done();await refresh(ticket,ack);}
    catch(error){if(ticket!==epoch)return;message(error.message||'尚未儲存，請稍後重試。');if(uncertainWrite(error)){ready=false;clear();message('尚無法確認儲存結果。請先重新載入確認，勿重複送出。');}}
    finally{unlock();busy=false;update();}
  }
  function invalidate(){epoch++;ready=false;discard();clear();message('登入狀態已變更，請重新登入後載入。');update();}
  db.auth?.onAuthStateChange?.((event,session)=>{const next=session?.user?.id;if(event==='SIGNED_OUT'||(next&&identity&&next!==identity))invalidate();identity=next||identity;});
  update();return{get busy(){return busy;},get ready(){return ready;},track,forget,canLeave,discard,load,write,message,invalidate,update};
}
