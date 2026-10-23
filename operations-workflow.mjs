import {editorDraft,lockControls,uncertainWrite} from './app-workflow.mjs?v=20261022-experience2';

// Keeps acknowledged writes separate from the read that refreshes their list.
export function operationsWorkflow({db,editor,status,read,apply,clear,close,onReady=()=>{}}){
 const draft=editorDraft(editor),root=document.querySelector('main');
 let busy=false,ready=false,epoch=0,identity=null,resumePending=false;
 const message=text=>{status.textContent=text;const local=editor.querySelector('[data-editor-result]');if(local){local.hidden=!text;local.textContent=text;}};
 const sync=()=>{root.querySelectorAll('[data-write]').forEach(n=>n.disabled=busy||!ready);onReady(ready&&!busy);};
 const clearEditor=()=>{draft.dispose();close();};
 const canLeave=()=>!busy&&draft.canLeave();
 async function refresh(ticket,ack=''){
  try{const data=await read();if(ticket!==epoch)return;ready=true;apply(data);message(ack||'資料已載入。');}
  catch(error){if(ticket!==epoch)return;ready=false;clear();message(ack?ack+' 清單暫時無法更新，請重新載入確認，勿重複送出。':error.message||'資料暫時無法載入，請重試。');}
 }
 async function load(){if(!canLeave())return;clearEditor();busy=true;ready=false;const ticket=++epoch,unlock=lockControls(root);message('正在確認權限並載入…');try{await refresh(ticket);}finally{unlock();busy=false;sync();if(resumePending)queueMicrotask(resume);}}
 async function write(task,ack){
  if(busy||!ready)return;busy=true;const ticket=epoch,unlock=lockControls(root);message('正在儲存，請稍候…');
  try{await task();if(ticket!==epoch)return;clearEditor();await refresh(ticket,ack);}
  catch(error){if(ticket!==epoch)return;message(error.message||'尚未儲存，請稍後重試。');if(uncertainWrite(error)){ready=false;clear();message('尚無法確認儲存結果。請先重新載入確認，勿重複送出。');}}
  finally{unlock();busy=false;if(ticket===epoch&&!ready)editor.querySelectorAll('button[type=submit],button:not([type])').forEach(n=>n.disabled=true);sync();if(resumePending)queueMicrotask(resume);}
 }
 // Private inbox content stays masked until a fresh authorized read completes.
 function suspend(){root.dataset.privatePaused='true';}
 async function resume(){
  resumePending=true;if(busy)return;resumePending=false;busy=true;ready=false;const ticket=++epoch,unlock=lockControls(root);message('正在重新確認權限…');
  try{await refresh(ticket);if(ticket===epoch&&ready&&!document.hidden)delete root.dataset.privatePaused;}
  finally{unlock();busy=false;sync();if(resumePending)queueMicrotask(resume);}
 }
 function invalidate(){epoch++;ready=false;clearEditor();clear();message('登入狀態已變更，請重新登入後載入。');sync();}
 db.auth?.onAuthStateChange?.((event,session)=>{const next=session?.user?.id;if(event==='SIGNED_OUT'||(next&&identity&&next!==identity))invalidate();identity=next||identity;});
 sync();return{get busy(){return busy;},get ready(){return ready;},draft,canLeave,load,write,invalidate,suspend,resume,close(){if(canLeave())clearEditor();},open(form){form.querySelector('[data-editor-result]')?.remove();const result=document.createElement('p');result.dataset.editorResult='true';result.className='status-message';result.setAttribute('role','status');result.hidden=true;form.insertBefore(result,form.lastElementChild);draft.attach(form);},message};
}
