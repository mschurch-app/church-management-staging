import {db,church,authorizePublishing,publishingApi,checkedConnection,invalidResult} from './publishing-settings-api.mjs?v=20261023-closeout1';
import {settingsWorkflow} from './settings-workflow.mjs?v=20261023-settings1';
export function connectionSettings(kind){
  const $=s=>document.querySelector(s),instagram=kind==='instagram',label=instagram?'Instagram':'YouTube',endpoint=instagram?'instagram-publishing':'youtube-oauth',box=$('#connection'),form=instagram?$('#connect-form'):$('.yt-actions'),token=$('#access-token');
  const flow=settingsWorkflow({db,root:document.querySelector('main'),clear:()=>{form.hidden=true;if(token)token.value='';box.querySelector('strong').textContent='連線狀態尚未確認';box.querySelector('span:last-child').textContent='請重新載入確認權限與連線。';box.classList.remove('ig-connected','yt-connected');},sync:({busy,ready})=>{if(token)token.disabled=busy||!ready;}});
  function render(value){
    const connected=value?.status==='connected';
    box.classList.toggle(instagram?'ig-connected':'yt-connected',connected);
    box.querySelector('strong').textContent=connected?(instagram?'已連結 @'+value.username:'已連結：'+value.channel_title):value?'連線已失效':'尚未連結';
    box.querySelector('span:last-child').textContent=connected?(instagram?'帳號已完成驗證，可供審核後發布使用。':'頻道 ID：'+value.channel_id):'請重新連結帳號，完成後再確認發布設定。';
    form.hidden=false;$('#connect').hidden=connected;$('#disconnect').hidden=!value;
    if(token){token.value='';token.required=!connected;token.closest('label').hidden=connected;form.querySelector('.ig-note').hidden=connected;flow.track(form);}
    return connected?label+' 已安全連結。':value?label+' 連線已失效，請重新連結。':'尚未連結 '+label+'。';
  }
  async function load(){await flow.load(async()=>{if(church!=='M+')throw Error(label+' 連線目前僅提供 M+ 大雅教會使用。');await authorizePublishing();return checkedConnection(await publishingApi(endpoint,'status'),kind);},render);}
  $('#back').href='media-publishing-settings.html?church='+encodeURIComponent(church);
  $('#reload').onclick=load;
  if(instagram)form.onsubmit=event=>{
    event.preventDefault();const accessToken=token.value.trim();if(!accessToken){token.setCustomValidity('請貼上存取權杖。');token.reportValidity();return;}
    flow.write(form,async()=>{const value=checkedConnection(await publishingApi(endpoint,'connect',{accessToken}),kind);if(value?.status!=='connected')throw invalidResult();return value;},'Instagram 已安全連結。',render);
  };
  if(token)token.oninput=()=>token.setCustomValidity('');
  if(!instagram)$('#connect').onclick=()=>flow.write(null,async()=>{
    const result=await publishingApi(endpoint,'authorize');let url;try{url=new URL(result.authorizationUrl);}catch{throw invalidResult();}
    if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw invalidResult();return url.href;
  },'正在前往 Google 授權…',url=>location.assign(url));
  $('#disconnect').onclick=()=>{
    if(!flow.ready||flow.busy||!confirm('確定要中斷 '+label+' 發布連線？'))return;
    flow.write(form,async()=>{const value=checkedConnection(await publishingApi(endpoint,'disconnect'),kind);if(value!==null)throw invalidResult();return value;},label+' 連線已中斷。',render);
  };
  flow.state();load();
}
