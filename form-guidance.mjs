// Business handlers decide which fields need correction. No values are persisted here.
let nextGuideId=0;
export class FieldValidationError extends Error{
 constructor(message='請修正標示欄位後再儲存。'){super(message);this.name='FieldValidationError';}
}
export function createFieldGuidance(root,{container,reveal=()=>{}}={}){
 const box=container||document.createElement('section'),prefix='field-guide-'+(++nextGuideId);let issues=[];
 box.classList.add('field-guidance');box.setAttribute('role','alert');box.tabIndex=-1;box.hidden=true;if(!container)root.prepend(box);
 const remove=issue=>{issue.note.remove();const described=(issue.control.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==issue.note.id);if(described.length)issue.control.setAttribute('aria-describedby',described.join(' '));else issue.control.removeAttribute('aria-describedby');if(issue.invalid===null)issue.control.removeAttribute('aria-invalid');else issue.control.setAttribute('aria-invalid',issue.invalid);};
 const focus=control=>{reveal(control);for(let parent=control.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;if(control.isConnected&&!control.disabled&&control.getClientRects().length){control.scrollIntoView({block:'center',behavior:'auto'});control.focus({preventScroll:true});}else box.focus();};
 function render(){
  box.replaceChildren();box.hidden=!issues.length;if(!issues.length)return;
  const title=document.createElement('strong'),list=document.createElement('ul');title.textContent='有 '+issues.length+' 處需要補齊或修正';box.append(title,list);
  for(const issue of issues){const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='field-guidance-link';button.dataset.appControl='custom';button.textContent=issue.message;button.onclick=()=>focus(issue.control);item.append(button);list.append(item);}
 }
 const clear=()=>{issues.forEach(remove);issues=[];render();};
 const corrected=event=>{const matched=issues.filter(issue=>issue.control===event.target);matched.forEach(remove);issues=issues.filter(issue=>issue.control!==event.target);if(matched.length)render();};
 root.addEventListener('input',corrected);root.addEventListener('change',corrected);
 return{report(items){clear();const seen=new Set();for(const item of items){const control=item.control;if(!control?.isConnected||seen.has(control))continue;seen.add(control);const note=document.createElement('p');note.id=prefix+'-'+issues.length;note.className='field-guidance-note';note.textContent=item.message;const invalid=control.getAttribute('aria-invalid');control.setAttribute('aria-invalid','true');const described=new Set((control.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(note.id);control.setAttribute('aria-describedby',[...described].join(' '));const anchor=item.anchor||control.closest('label')||control.closest('.finance-inline')||control;anchor.after(note);issues.push({...item,note,invalid});}render();return issues.length>0;},clear,focusFirst(){if(issues.length)focus(issues[0].control);},get hasErrors(){return issues.length>0;}};
}
