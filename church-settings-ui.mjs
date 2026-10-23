import {readAccess,canOpen,canAction,chooseChurch} from './admin-access.mjs?v=20261022-experience5';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {loadChurchSettings,saveChurchSettings} from './church-settings-management.mjs?v=20261023-settings1';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20261023-settings1';
import {availableSettingsGroups,matchesFunction} from './app-function-catalog.mjs?v=20261009-stage2';
import {createSettingsEntry,element} from './app-ui.mjs?v=20261009-stage2';
import {settingsWorkflow} from './settings-workflow.mjs?v=20261023-settings1';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
let church=params.get('church')||'M+',current=null,canEdit=false;
const publicInfoPanel=$('#church-public-info'),info=s=>publicInfoPanel.querySelector(s),fields={brand_color:'#brand-color',logo_url:'#logo-url',service_info:'#service-info',address:'#address',map_url:'#map-url'};
const flow=settingsWorkflow({db,status:$('#hub-status'),clear:()=>{current=null;canEdit=false;info('#form').reset();publicInfoPanel.remove();$('#settings-tools').replaceChildren();$('#settings-directory').replaceChildren();},sync:({busy,ready})=>{info('#form').querySelectorAll('input,textarea,button[type=submit]').forEach(n=>n.disabled=busy||!ready||!canEdit);info('#reload').disabled=busy;}});
function paintInfo(data){current=data;for(const [key,selector] of Object.entries(fields))info(selector).value=data[key]||'';info('#color-picker').value=data.brand_color||'#173F34';flow.track(info('#form'));}
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

async function load(){await flow.load(async()=>{
 const access=await readAccess(db),target=chooseChurch(access,church);
 const [capabilities,settings]=await Promise.all([db.rpc('get_my_app_capabilities'),loadChurchCustomizations(db,target)]);
 if(capabilities.error)throw new Error('暫時無法確認設定權限，請重新載入。');
 const groups=availableSettingsGroups(access,target,{is_owner:capabilities.data?.is_owner===true},settings),publicInfo=canOpen(access,target,'pastoral');
 const data=publicInfo?await loadChurchSettings(db,target):null;
 return {access,target,groups,data};
},({access,target,groups,data})=>{
 church=target;canEdit=canAction(access,church,'pastoral_chats','edit');publicInfoPanel.remove();const container=$('#settings-tools'),directory=$('#settings-directory');container.replaceChildren();directory.replaceChildren();
 $('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 教會設定';
 for(const group of groups){const section=element('section','','settings-group');section.id='settings-group-'+group.key;section.dataset.settingsGroup=group.key;const heading=element('header','','settings-group-heading'),title=element('h2',group.title);title.id=section.id+'-title';section.setAttribute('aria-labelledby',title.id);heading.append(title,element('p',group.note,'muted'));const grid=element('div','','settings-link-grid');for(const key of group.keys)grid.append(createSettingsEntry(key,church));section.append(heading,grid);container.append(section);const jump=element('a',group.title);jump.href='#'+section.id;jump.dataset.settingsTarget=section.id;directory.append(jump);}
 const churchGroup=$('#settings-group-church');if(data&&churchGroup){churchGroup.append(publicInfoPanel);publicInfoPanel.hidden=false;info('#public-info-state').textContent=canEdit?'編輯聚會時間、地址與公開外觀，完成後儲存。':'目前為唯讀，修改需取得編輯權限。';paintInfo(data);}filterSettings();return groups.length?'設定已載入。':'目前沒有可使用的設定工具。';
});}
info('#form').onsubmit=event=>{event.preventDefault();if(!current||!canEdit)return;void flow.write(info('#form'),()=>saveChurchSettings(db,church,Object.fromEntries(Object.entries(fields).map(([key,selector])=>[key,info(selector).value])),current),'堂會資訊已儲存。',async(_,active)=>{const data=await loadChurchSettings(db,church);if(active())paintInfo(data);});};
info('#color-picker').oninput=()=>info('#brand-color').value=info('#color-picker').value.toUpperCase();
info('#brand-color').oninput=()=>{if(/^#[0-9A-Fa-f]{6}$/.test(info('#brand-color').value))info('#color-picker').value=info('#brand-color').value;};
info('#reload').onclick=load;$('#hub-reload').onclick=load;$('#settings-search').addEventListener('input',filterSettings);void load();
