import {draftGuard,lockControls,uncertainWrite} from './app-workflow.mjs?v=20261022-experience2';

export const invalidResult=()=>Object.assign(new Error('伺服器未回傳確認結果。'),{name:'InvalidResponseError'});
export function checkedResult(result,accept= data=>data===true){
  if(result.error)throw result.error;
  if(!accept(result.data))throw invalidResult();
  return result.data;
}

// A card acknowledges only its own draft. Other cards may still contain unsaved changes.
export function settingsWorkflow({db,root=document.body,status=document.querySelector('#status'),clear=()=>{},sync=()=>{}}){
  let busy=false,ready=false,epoch=0,identity,invalidated=false;
  const guards=new Map();
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  const message=(text,tone='')=>{status.textContent=text;status.dataset.tone=tone;};
  const track=form=>{if(!guards.has(form))guards.set(form,draftGuard(form));return guards.get(form);};
  const forget=()=>{for(const guard of guards.values())guard.dispose();guards.clear();};
  const canLeave=()=>!busy&&(![...guards.values()].some(guard=>guard.dirty)||confirm('還有尚未儲存的修改。要放棄並重新載入嗎？'));
  const state=()=>{root.querySelectorAll('[data-settings-write]').forEach(node=>node.disabled=busy||!ready||node.dataset.readonly==='true');sync({busy,ready});};
  async function load(read,apply,{quiet=false}={}){
    if(busy||(!quiet&&!canLeave())||(quiet&&invalidated))return false;
    const ticket=epoch;busy=true;ready=false;const unlock=lockControls(root);message('正在載入設定…');
    try{const data=await read();if(ticket!==epoch)return false;forget();const loaded=apply(data);ready=true;invalidated=false;message(typeof loaded==='string'?loaded:'設定已載入。');return true;}
    catch(error){if(ticket!==epoch)return false;forget();clear();message(error.message||'無法載入設定，請重新載入。');return false;}
    finally{unlock();busy=false;state();}
  }
  async function write(form,task,ack,commit=()=>{}){
    if(busy||!ready)return false;
    const report=(text,tone='')=>{message(text,tone);if(form?.isConnected){let local=form.querySelector('[data-settings-result],[role=status]');if(!local){local=document.createElement('p');local.dataset.settingsResult='';local.className='settings-result';local.setAttribute('role','status');form.append(local);}local.textContent=text;local.dataset.tone=tone;}};
    const ticket=epoch;busy=true;const unlock=lockControls(root);report('正在儲存…');let saved=false;
    try{const result=await task(()=>ticket===epoch);if(ticket!==epoch)return false;saved=true;guards.get(form)?.clear();await commit(result,()=>ticket===epoch);if(ticket!==epoch)return false;report(ack,'success');return true;}
    catch(error){if(ticket!==epoch)return false;if(saved||uncertainWrite(error)){ready=false;report(saved?'設定已儲存，但畫面暫時無法更新。請重新載入核對，無須再次送出。':'尚無法確認儲存結果。請重新載入核對，暫停再次送出。','error');}else report(error.message||'設定未儲存，已保留修改。','error');return false;}
    finally{unlock();busy=false;state();}
  }
  db.auth.onAuthStateChange((event,session)=>{const next=session?.user?.id;if(event==='INITIAL_SESSION'){identity=next;return;}if(event==='SIGNED_OUT'||(identity&&next&&identity!==next)){epoch++;ready=false;invalidated=true;forget();clear();state();message('登入狀態已變更，請重新登入後載入。');}identity=next;});
  root.dataset.actionFeedback='off';
  return {get busy(){return busy;},get ready(){return ready;},get invalidated(){return invalidated;},track,forget,canLeave,load,write,message,state};
}

// Reorder by buttons on touch devices or keyboard; one handler per stable list.
export function accessibleSorter(container,onChange){
  container._settingsReorder=onChange;
  if(container.dataset.settingsSorter)return;
  container.dataset.settingsSorter='true';
  container.addEventListener('click',event=>{
    const button=event.target.closest('[data-move]');if(!button||button.disabled)return;
    const row=button.closest('[data-sort-row]'),other=button.dataset.move==='up'?row.previousElementSibling:row.nextElementSibling;
    if(!other)return;
    const move=button.dataset.move;
    if(move==='up')container.insertBefore(row,other);else container.insertBefore(other,row);
    const index=[...container.children].indexOf(row);
    container._settingsReorder([...container.children].map(item=>item.dataset.sortKey));
    const target=container.children[index];
    (target?.querySelector(`[data-move="${move}"]`)||container.querySelector('[data-move]'))?.focus();
  });
}
