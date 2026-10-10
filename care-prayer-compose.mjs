import {createCarePrayer} from './prayer-management.mjs?v=20261010-care-orbs1';

// The caller owns the page's busy state; this form keeps its request ID on retry.
export function createPrayerForm({db,church,onSave,onCancel,onBusy,onError,categories=[]}){
  const form=document.createElement('form'),fields={},requestId=crypto.randomUUID();
  const heading=document.createElement('h2');heading.textContent='新增關懷代禱';
  const hint=document.createElement('p');hint.className='muted';hint.textContent='儲存後直接呈現在本堂 LINE 禱告光環，讓弟兄姊妹一起守望。';form.append(heading,hint);
  for(const [key,label,max,placeholder] of [['author_name','代禱對象／稱呼',60,'請填寫希望顯示的稱呼'],['title','代禱主題',80,'例如：為家人的平安禱告'],['content','代禱內容',1000,'填寫要讓弟兄姊妹一起守望的禱告'],['group_name','小組／小家（選填）',100,'未編組']]){
    const wrap=document.createElement('label'),input=document.createElement(key==='content'?'textarea':'input');wrap.textContent=label;input.maxLength=max;input.required=key!=='group_name';input.placeholder=placeholder;wrap.append(input);form.append(wrap);fields[key]=input;
  }
  const privacyWrap=document.createElement('label'),privacy=document.createElement('select');privacyWrap.textContent='公開範圍';privacy.append(new Option('顯示在 LINE 禱告光環','public'),new Option('僅教牧同工可見','private'));privacyWrap.append(privacy);form.append(privacyWrap);
  privacy.onchange=()=>{hint.textContent=privacy.value==='public'?'儲存後直接呈現在本堂 LINE 禱告光環，讓弟兄姊妹一起守望。':'這筆代禱僅限獲授權同工查看。';save.textContent=privacy.value==='public'?'儲存並加入禱告光環':'儲存私密代禱';};
  const categoryWrap=document.createElement('label'),category=document.createElement('select');categoryWrap.textContent='代禱分類（選填）';category.append(new Option('未分類',''),...categories.map(value=>new Option(value,value)));categoryWrap.append(category);form.append(categoryWrap);
  const actions=document.createElement('div');actions.className='editor-actions';const cancel=document.createElement('button'),save=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='取消';cancel.onclick=onCancel;save.type='submit';save.textContent='儲存並加入禱告光環';actions.append(cancel,save);form.append(actions);
  const result=document.createElement('p');result.className='status-message';result.setAttribute('role','status');form.append(result);
  let saving=false;
  form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;onBusy(true);form.querySelectorAll('input,textarea,select,button').forEach(node=>node.disabled=true);result.textContent='正在儲存代禱…';try{
    const input=Object.fromEntries(Object.entries(fields).map(([key,node])=>[key,node.value]));input.is_private=privacy.value==='private';input.category=category.value;
    await createCarePrayer(db,church,input,requestId);await onSave(input.is_private);
  }catch(error){result.textContent=error.message;onError(error);form.querySelectorAll('input,textarea,select,button').forEach(node=>node.disabled=false);}finally{saving=false;onBusy(false);}};
  return form;
}
