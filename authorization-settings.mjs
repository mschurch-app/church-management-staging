import {db,church,authorizePublishing,publishingApi} from './publishing-settings-api.mjs?v=20261102-bibletree-admin1';
const status=document.querySelector('#status'),list=document.querySelector('#authorization-list'),connection=document.querySelector('#association-status'),controls=document.querySelector('#association-controls');
let revision=0,busy=false;
const message=error=>error?.message||'暫時無法確認連線，請重新載入。';
function render(profile){
 connection.textContent=profile.connection.connected?'已連結：'+profile.connection.page_name:'尚未連結協會 Facebook。';controls.replaceChildren();
 if(!profile.access.reviewer){connection.textContent+=' 管理連線需由指定審核人員操作。';return;}
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=profile.connection.connected?'更新協會 FB 授權':'設定協會 FB 授權';details.append(summary);
 const note=document.createElement('p');note.textContent='僅連結台灣基督教社會關懷協會粉專。既有授權已加密保存，不會顯示；只有需要更新時才輸入新憑證。';details.append(note);
 const form=document.createElement('form'),label=document.createElement('label'),token=document.createElement('input'),button=document.createElement('button');label.textContent='新的粉絲專頁授權憑證';token.type='password';token.autocomplete='new-password';token.required=true;token.style.width='100%';label.append(token);button.type='submit';button.textContent='驗證並安全儲存連線';form.append(label,button);details.append(form);controls.append(details);controls.hidden=false;
 form.onsubmit=async event=>{event.preventDefault();if(busy||!token.value.trim())return;const current=revision;busy=true;button.disabled=true;const pageToken=token.value.trim();token.value='';connection.textContent='正在核對協會粉專並加密保存…';try{await publishingApi('association-stories','connect',{pageId:profile.connection.target_page_id,pageToken});const updated=await publishingApi('association-stories','profile');if(current===revision)render(updated);}catch(error){if(current===revision)connection.textContent=message(error);}finally{token.value='';busy=false;button.disabled=false;}};
}
async function load(){if(busy)return;const current=++revision;list.hidden=true;controls.replaceChildren();controls.hidden=true;status.textContent='正在確認管理權限…';try{await authorizePublishing();if(current!==revision)return;list.hidden=false;for(const id of ['church-facebook','association-facebook','facebook-maintenance'])document.getElementById(id).hidden=church!=='M+';status.textContent='請選擇要管理的服務；各服務的授權範圍維持獨立。';if(church!=='M+')return;connection.textContent='正在確認協會 FB 連線…';void loadChurch(current);void loadMaintenance();try{const profile=await publishingApi('association-stories','profile');if(current===revision)render(profile);}catch(error){if(current===revision)connection.textContent=message(error);}}catch(error){if(current===revision)status.textContent=message(error);}}
document.querySelector('#back').href='church-settings.html?church='+encodeURIComponent(church);
list.querySelectorAll('a').forEach(a=>{const url=new URL(a.getAttribute('href'),location.href);url.searchParams.set('church',church);a.href=url;});
document.querySelector('#reload').onclick=load;
db.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){revision++;controls.replaceChildren();document.querySelector('#church-facebook-controls').replaceChildren();list.hidden=true;status.textContent='登入或權限已變更，請重新載入。';}});
void load();

async function loadChurch(current){
 const state=document.querySelector('#church-facebook-status'),box=document.querySelector('#church-facebook-controls');box.replaceChildren();box.hidden=true;state.textContent='正在確認教會 FB 連線…';
 try{const r=await publishingApi('church-facebook-connection','status');if(current!==revision)return;const c=r.connection;state.textContent=c?'已連結：'+c.page_name:'尚未連結教會 Facebook。';
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=c?'更新教會 FB 授權':'設定教會 FB 授權';details.append(summary);
 const note=document.createElement('p');note.textContent='僅限 M+大雅教會粉專，與協會授權分開加密保存。此處只設定連線，不會發布貼文。';details.append(note);
 const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');label.textContent='教會粉絲專頁授權憑證';input.type='password';input.autocomplete='new-password';input.required=true;input.style.width='100%';label.append(input);button.type='submit';button.textContent='驗證並儲存教會連線';form.append(label,button);details.append(form);box.append(details);box.hidden=false;
 form.onsubmit=async event=>{event.preventDefault();if(busy||!input.value.trim())return;busy=true;button.disabled=true;const pageToken=input.value.trim();input.value='';state.textContent='正在核對教會粉專並加密保存…';try{await publishingApi('church-facebook-connection','connect',{pageToken});if(current===revision)await loadChurch(current);}catch(error){if(current===revision)state.textContent=message(error);}finally{input.value='';busy=false;button.disabled=false;}};
 }catch(error){if(current===revision)state.textContent=message(error);}
}

async function loadMaintenance(check=false){
 const root=document.querySelector('#facebook-health'),button=document.querySelector('#check-facebook'),current=revision;if(busy)return;const checkRevision=current;
 button.disabled=true;root.textContent=check?'正在核對粉專身分與貼文讀取能力…':'正在載入最近檢查結果…';
 try{const result=await publishingApi('facebook-connection-maintenance',check?'check':'status');if(checkRevision!==revision)return;root.replaceChildren();const labels={healthy:'連線正常',reauthorization_required:'需要重新連結',permission_required:'需要確認發布權限',check_failed:'暫時未能完成檢查',unchecked:'尚待首次檢查',not_connected:'尚未連線'};
 for(const channel of ['church','association']){const item=result.items?.find(x=>x.channel===channel),p=document.createElement('p');p.textContent=(channel==='church'?'教會 FB':'協會 FB')+'：'+(labels[item?.status]||'尚待檢查')+'。'+(item?.token_lifetime==='no_fixed_expiry'?'授權沒有固定到期日。':item?.expires_at?'到期日：'+new Date(item.expires_at).toLocaleDateString('zh-TW')+'。':'授權效期尚待核對。')+(item?.checked_at?'最近檢查：'+new Date(item.checked_at).toLocaleString('zh-TW'):'');root.append(p);}
 }catch{if(checkRevision===revision)root.textContent='目前無法取得維護狀態。既有連線仍保留，請稍後重新檢查。';}finally{button.disabled=false;}
}
document.querySelector('#check-facebook').onclick=()=>void loadMaintenance(true);
