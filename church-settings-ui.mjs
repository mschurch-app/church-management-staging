import {readAccess,canOpen,canAction,chooseChurch} from './admin-access.mjs?v=20261009-stage1';
import {db} from './admin-db.mjs?v=20261009-stage3';
import {loadChurchSettings,saveChurchSettings} from './church-settings-management.mjs?v=20261009-stage2';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20261009-stage2';
import {availableSettingsGroups,matchesFunction} from './app-function-catalog.mjs?v=20261009-stage2';
import {createSettingsEntry,element,setStatus} from './app-ui.mjs?v=20261009-stage2';
const $=selector=>document.querySelector(selector),params=new URLSearchParams(location.search);
let church=params.get('church')||'M+',current=null,busy=false,canEdit=false;
const publicInfoPanel=$('#church-public-info');
const info=selector=>publicInfoPanel.querySelector(selector);
const fields={brand_color:'#brand-color',logo_url:'#logo-url',service_info:'#service-info',address:'#address',map_url:'#map-url'};
function enabled(value){info('#form').querySelectorAll('input,textarea,button[type=submit]').forEach(node=>node.disabled=!value||!canEdit);info('#reload').disabled=!value;}
async function load(){
  enabled(false);setStatus(info('#status'),'正在載入堂會資訊…',{busy:true});
  try{current=await loadChurchSettings(db,church);for(const [key,selector] of Object.entries(fields))info(selector).value=current[key]||'';info('#color-picker').value=current.brand_color||'#A83929';enabled(true);setStatus(info('#status'),'');}
  catch(error){current=null;setStatus(info('#status'),error.message,{tone:'error'});info('#reload').disabled=false;}
}
info('#form').onsubmit=async event=>{
  event.preventDefault();if(busy||!current||!canEdit)return;busy=true;enabled(false);setStatus(info('#status'),'正在儲存堂會資訊…',{busy:true});
  try{await saveChurchSettings(db,church,Object.fromEntries(Object.entries(fields).map(([key,selector])=>[key,info(selector).value])),current);await load();if(current)setStatus(info('#status'),'堂會資訊已儲存。',{tone:'success'});}
  catch(error){enabled(true);setStatus(info('#status'),error.message,{tone:'error'});}
  finally{busy=false;}
};
info('#color-picker').oninput=()=>info('#brand-color').value=info('#color-picker').value.toUpperCase();
info('#brand-color').oninput=()=>{if(/^#[0-9A-Fa-f]{6}$/.test(info('#brand-color').value))info('#color-picker').value=info('#brand-color').value;};
info('#reload').onclick=load;
function filterSettings(){
 const query=$('#settings-search').value.trim();let visible=0;
 for(const group of document.querySelectorAll('.settings-group')){
  for(const card of group.querySelectorAll('.settings-link-card')){card.hidden=!matchesFunction(card.dataset.functionKey,query);if(!card.hidden)visible++;}
  const publicForm=group.querySelector('#church-public-info');if(publicForm){const keywords='堂會 外觀 聚會 地址 資訊 位置 logo';publicForm.hidden=Boolean(query&&!query.toLowerCase().split(/\s+/).every(term=>keywords.includes(term)));if(!publicForm.hidden)visible++;}
  group.hidden=![...group.querySelectorAll('.settings-link-card')].some(card=>!card.hidden)&&(!publicForm||publicForm.hidden);
  const directory=document.querySelector(`[data-settings-target="${group.id}"]`);if(directory)directory.hidden=group.hidden;
 }
 const state=$('#settings-search-state');state.hidden=!query;state.textContent=visible?'找到 '+visible+' 項設定工具':'找不到符合的設定，請換個名稱。';
}
$('#settings-search').addEventListener('input',filterSettings);
async function startHub(){
 canEdit=false;enabled(false);setStatus($('#hub-status'),'正在確認可使用的設定…',{busy:true});
 try{
  const access=await readAccess(db);church=chooseChurch(access,church);
  const [capabilities,settings]=await Promise.all([db.rpc('get_my_app_capabilities'),loadChurchCustomizations(db,church)]);
  if(capabilities.error)throw new Error('暫時無法確認設定權限，請稍後重試。');
  const home={is_owner:!capabilities.error&&capabilities.data?.is_owner===true};
  const groups=availableSettingsGroups(access,church,home,settings),container=$('#settings-tools'),directory=$('#settings-directory');
  publicInfoPanel.hidden=true;publicInfoPanel.remove();container.replaceChildren();directory.replaceChildren();
  $('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 教會設定';
  for(const group of groups){
    const section=element('section','','settings-group');section.id='settings-group-'+group.key;section.dataset.settingsGroup=group.key;
    const heading=element('header','','settings-group-heading'),title=element('h2',group.title);title.id=section.id+'-title';section.setAttribute('aria-labelledby',title.id);heading.append(title,element('p',group.note,'muted'));
    const grid=element('div','','settings-link-grid');for(const key of group.keys)grid.append(createSettingsEntry(key,church));section.append(heading,grid);container.append(section);
    const jump=element('a',group.title);jump.href='#'+section.id;jump.dataset.settingsTarget=section.id;directory.append(jump);
  }
  const publicInfo=canOpen(access,church,'pastoral'),churchGroup=$('#settings-group-church');
  if(publicInfo&&churchGroup){canEdit=canAction(access,church,'pastoral_chats','edit');churchGroup.append(publicInfoPanel);publicInfoPanel.hidden=false;info('#public-info-state').textContent=canEdit?'更新教會公開的聚會資訊與位置。':'你可查看堂會資訊；修改請由有編輯權限的同工處理。';await load();}
  setStatus($('#hub-status'),groups.length?'':'目前沒有可使用的設定工具。');
  filterSettings();
 }catch(error){setStatus($('#hub-status'),error.message,{tone:'error'});const retry=element('button','重新載入','secondary');retry.type='button';retry.dataset.actionFeedback='off';retry.onclick=()=>{retry.remove();void startHub();};$('#hub-status').append(retry);}
}
void startHub();
