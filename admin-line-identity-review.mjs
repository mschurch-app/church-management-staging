const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const deadline=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('request_timeout')),15000);})]);}finally{clearTimeout(timer);}};
function errorMessage(error){
 const message=String(error?.message||'');
 if(message.includes('account_changed'))return '資料已變更，請重新載入核對資料後再確認。';
 if(/not_owner|session_revoked|forbidden/.test(message))return '目前沒有核對權限，請重新登入後再試。';
 if(/invalid_target|line_identity_not_found|identity_already_linked/.test(message))return '帳號狀態已變更，請重新載入核對資料。';
 return '尚未確認儲存結果，請重試；已選內容會保留。';
}
export async function mountLineIdentityReview(db,area,user,{onBack=()=>{},onSaved=()=>{}}={}){
 let busy=false,cancelled=false;
 area.hidden=false;area.replaceChildren();
 const heading=el('div','','account-editor-heading'),back=el('button','返回名單','secondary'),message=el('p','正在載入 LINE 身分核對…','form-message');
 back.type='button';back.onclick=()=>{if(!busy){cancelled=true;onBack();}};heading.append(el('h2','核對 LINE 身分'),back);message.setAttribute('role','status');area.append(heading,message);
 const retry=el('button','重新載入核對資料','secondary');retry.type='button';retry.onclick=()=>void mountLineIdentityReview(db,area,user,{onBack,onSaved});
 let detail;
 try{const result=await deadline(db.rpc('get_line_admin_access_review',{p_user:user}));if(result.error||!result.data)throw result.error||new Error();detail=result.data;}catch{message.textContent='無法載入 LINE 身分核對，請重新載入。';area.append(retry);return;}
 if(cancelled||!area.isConnected||area.hidden)return;
 message.textContent='';
 const identity=el('section','','account-step'),facts=el('dl','','line-identity-facts');
 const fact=(label,value)=>{facts.append(el('dt',label),el('dd',value||'尚未提供'));};
 fact('同工姓名',detail.account_name);fact('申請時填寫的姓名',detail.application_name);fact('LINE 暱稱',detail.line_name);
 identity.append(el('h3','先核對這位同工'),facts,el('p','LINE 暱稱可以和姓名不同。請向本人確認這是他的 LINE；上述姓名供你核對，不會自動認定是同一人。','muted'));area.append(identity);
 if(detail.approved||detail.identity_confirmed){message.textContent=detail.approved?'已完成既有帳號連結。':'已確認此 LINE 為這位同工本人，原有權限保留。';message.className='form-message success';return;}
 const sections=[],controls=[back];
 const finish=async text=>{
  for(const section of sections)section.remove();
  retry.remove();message.textContent=text;message.className='form-message success';
  try{await onSaved();}catch{message.textContent=text+' 名單更新失敗，請稍後重新整理；本次核對已儲存。';}
 };
 const run=async(button,rpc,args,success)=>{
  if(busy)return;busy=true;const label=button.textContent;controls.forEach(n=>n.disabled=true);button.textContent='正在儲存…';message.textContent='正在儲存核對結果…';message.className='form-message';
  try{const result=await deadline(db.rpc(rpc,args));if(result.error||result.data!==true)throw result.error||new Error();await finish(success);}
  catch(error){message.textContent=errorMessage(error);message.className='form-message error';area.append(retry);}
  finally{busy=false;controls.forEach(n=>n.disabled=false);button.textContent=label;sync();}
 };
 let currentBox,currentButton,linkBox,linkButton,select;
 const sync=()=>{if(currentButton)currentButton.disabled=busy||!currentBox.checked;if(linkButton)linkButton.disabled=busy||!linkBox.checked||!select.value;};
 if(detail.can_confirm_current&&detail.review_version){
  const section=el('section','','account-step'),label=el('label','','check-panel');currentBox=document.createElement('input');currentBox.type='checkbox';currentBox.dataset.identityCurrent='1';
  label.append(currentBox,el('span','我已向本人核對：這個 LINE 就是「'+detail.account_name+'」本人使用。'));
  currentButton=el('button','確認為這位同工本人');currentButton.type='button';currentButton.disabled=true;currentBox.onchange=sync;
  currentButton.onclick=()=>void run(currentButton,'confirm_line_account_identity',{p_user:user,p_version:detail.review_version},'已確認此 LINE 為「'+detail.account_name+'」本人，原有權限保留。');
  section.append(el('h3','確認目前這個同工帳號'),el('p','如果他就是上方這位同工，在此確認即可，不必再找另一個同名帳號。'),label,currentButton);area.append(section);sections.push(section);controls.push(currentBox,currentButton);
 }
 const advanced=el('details','','account-advanced'),label=el('label','選擇另一個既有同工帳號');advanced.append(el('summary','已有另一個帳號？連結既有帳號'),el('p','只有確認同一人有兩個帳號時才使用。連結後會套用所選既有帳號的權限，請先核對本人與帳號。','account-editor-note'));
 select=document.createElement('select');select.append(new Option('請選擇另一個既有同工',''));
 for(const item of detail.candidates||[]){const option=new Option((item.display_name||'未填姓名')+'｜'+(item.job_title||'同工')+(item.email?'｜'+item.email:''),item.user_id);select.append(option);}
 label.append(select);const confirmation=el('label','','check-panel');linkBox=document.createElement('input');linkBox.type='checkbox';confirmation.append(linkBox,el('span','我已核對這兩個帳號屬於同一人，並確認要套用所選帳號的權限。'));
 linkButton=el('button','連結並套用既有權限');linkButton.type='button';linkButton.disabled=true;linkBox.onchange=sync;select.onchange=()=>{linkBox.checked=false;sync();};
 linkButton.onclick=()=>{if(busy||!select.value||!linkBox.checked||!confirm('確認連結「'+(detail.account_name||detail.line_name)+'」與「'+select.selectedOptions[0].textContent+'」？連結後會套用所選既有帳號的權限。'))return;void run(linkButton,'approve_line_admin_access_review',{p_user:user,p_source_user:select.value},'LINE 與既有同工帳號已完成連結。');};
 advanced.append(label,confirmation,linkButton);if(!detail.can_confirm_current)advanced.open=true;
 area.append(advanced);sections.push(advanced);controls.push(select,linkBox,linkButton);sync();
}
