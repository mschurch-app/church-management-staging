// Business pages own the result; these helpers never infer success from network activity.
export const node=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
export const uncertainWrite=error=>['AbortError','TimeoutError','TypeError','InvalidResponseError'].includes(error?.name)||/Failed to fetch|NetworkError|連線逾時|操作逾時|網路中斷/i.test(error?.message||'');

// A successful HTTP status alone does not acknowledge a business operation.
export async function apiResult(response){
  const result=await response.json().catch(()=>null);
  if(response.ok&&(!result||typeof result!=='object'||result.ok!==true)){
    const error=new Error('尚無法確認操作結果，請重新載入確認。');error.name='InvalidResponseError';throw error;
  }
  return result||{};
}

export function lockControls(root){
  const controls=[...root.querySelectorAll('button,input,textarea,select')].map(control=>[control,control.disabled]);
  root.setAttribute('aria-busy','true');
  for(const [control] of controls)control.disabled=true;
  return()=>{root.removeAttribute('aria-busy');for(const [control,disabled] of controls)if(control.isConnected)control.disabled=disabled;};
}

export function workflowSummary(target,{title,description,steps=[],active=0}){
  target.replaceChildren();target.className='workflow-summary';
  const copy=node('div','','workflow-summary-copy');copy.append(node('p','接下來','workflow-kicker'),node('h2',title),node('p',description));target.append(copy);
  if(steps.length){const list=node('ol','','workflow-steps');steps.forEach((text,index)=>{const item=node('li');item.append(node('span',String(index+1)),document.createTextNode(text));if(index===active)item.setAttribute('aria-current','step');if(index<active)item.dataset.complete='true';list.append(item);});target.append(list);}
}

export function draftGuard(form,onChange=()=>{}){
  let dirty=false;
  const mark=()=>{dirty=true;onChange(true);};
  form.addEventListener('input',mark);form.addEventListener('change',mark);
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return{get dirty(){return dirty;},mark,clear(){dirty=false;onChange(false);},canLeave(){return!dirty||confirm('還有尚未儲存的修改。要放棄這些修改並切換嗎？');}};
}

export function reviewDialog({title,description,label='補充說明（選填）',required=false,confirmLabel='確認',withNote=true}){
  if(document.querySelector('.workflow-dialog[open]'))return Promise.resolve(null);
  const dialog=node('dialog','','workflow-dialog'),form=node('form'),heading=node('h2',title),copy=node('p',description),wrap=node('label',label),note=node('textarea'),actions=node('div','','workflow-dialog-actions'),cancel=node('button','取消','secondary'),accept=node('button',confirmLabel);
  heading.id='workflow-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);form.dataset.actionFeedback='off';note.required=required;note.maxLength=2000;note.rows=4;wrap.append(note);cancel.type='button';accept.type='submit';actions.append(cancel,accept);form.append(heading,copy);if(withNote)form.append(wrap);form.append(actions);dialog.append(form);document.body.append(dialog);
  const focus=document.activeElement,position=scrollY,styles={position:document.body.style.position,top:document.body.style.top,width:document.body.style.width,overflow:document.body.style.overflow};
  document.body.style.position='fixed';document.body.style.top=`-${position}px`;document.body.style.width='100%';document.body.style.overflow='hidden';
  return new Promise(resolve=>{
    const finish=value=>{dialog.close();dialog.remove();Object.assign(document.body.style,styles);window.scrollTo({top:position,behavior:'instant'});if(focus?.isConnected)focus.focus({preventScroll:true});resolve(value);};
    cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    form.onsubmit=event=>{event.preventDefault();if(required&&!note.value.trim()){note.setCustomValidity('請填寫原因。');note.reportValidity();return;}finish(note.value.trim());};
    note.oninput=()=>note.setCustomValidity('');dialog.showModal();(withNote?note:cancel).focus();
  });
}
