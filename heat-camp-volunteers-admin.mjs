import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';

const $=selector=>document.querySelector(selector);
const labels={group_leader:'小隊輔',worship:'敬拜團',basketball_assistant:'籃球助教'};
const states={pending:'待聯繫',contacted:'已聯繫',selected:'已錄取',declined:'未錄取'};
const limits={group_leader:10,worship:5,basketball_assistant:6};
let data={items:[],selected_counts:{}},canEdit=false;
const el=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
const localDate=iso=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
const roleText=roles=>(roles||[]).map(role=>labels[role]||role).join('、')||'—';

async function request(action,extra={}){
  const response=await db.functions.invoke('heat-camp-volunteer',{body:{action,...extra}});
  if(response.error||!response.data?.ok){const code=response.data?.error;throw new Error(({forbidden:'沒有熱火籃球營管理權限。',role_full:'該服務名額已滿，請重新安排。',invalid_roles:'錄取職務必須從報名者的意願中選擇。',login_required:'登入已逾期，請重新登入。'})[code]||'暫時無法完成操作，請稍後再試。');}
  return response.data;
}
function detail(label,value,link){const box=el('div');box.append(el('span',label));if(link){const a=el('a',value||'—');a.href=link;box.append(a);}else box.append(el('strong',value||'—'));return box;}
function renderSummary(){const root=$('#summary');root.replaceChildren();for(const key of Object.keys(limits)){const card=el('article');card.append(el('strong',`${data.selected_counts[key]||0} / ${limits[key]}`),el('span',`${labels[key]}已錄取`));root.append(card);}}
function renderCard(item){
  const card=el('article','','application-card');card.id=`application-${item.id}`;
  const head=el('div','','application-head');const title=el('div');title.append(el('h3',item.name),el('div',`${states[item.status]||item.status} · ${localDate(item.created_at)}`,'application-meta'));head.append(title,el('strong',roleText(item.requested_roles)));card.append(head);
  const details=el('div','','application-details');details.append(detail('所屬教會',item.church_affiliation),detail('手機',item.phone,`tel:${item.phone.replace(/[^0-9+]/g,'')}`),detail('Email',item.email,`mailto:${encodeURIComponent(item.email)}`),detail('LINE ID',item.line_id),detail('志工意願',roleText(item.requested_roles)),detail('已安排職務',roleText(item.assigned_roles)),detail('LINE 群通知',({sent:'已送達',failed:'傳送失敗',unavailable:'尚未設定',pending:'待發送'})[item.line_status]||item.line_status));card.append(details);
  if(item.experience)card.append(el('p',`相關經驗：${item.experience}`,'application-note'));
  if(item.notes)card.append(el('p',`備註：${item.notes}`,'application-note'));
  if(canEdit){
    const actions=el('div','','application-actions');const stateLabel=el('label','審核狀態');const select=el('select');for(const [key,label] of Object.entries(states)){const option=el('option',label);option.value=key;select.append(option);}select.value=item.status;stateLabel.append(select);actions.append(stateLabel);
    const assigned=el('div','','assigned');assigned.append(el('span','錄取職務：'));
    for(const role of item.requested_roles){const label=el('label');const check=document.createElement('input');check.type='checkbox';check.value=role;check.checked=(item.assigned_roles||[]).includes(role);label.append(check,el('span',labels[role]));assigned.append(label);}actions.append(assigned);
    const save=el('button','儲存');save.type='button';const status=el('span','','save-status');actions.append(save,status);card.append(actions);
    const refreshAssigned=()=>{assigned.hidden=select.value!=='selected';};select.addEventListener('change',refreshAssigned);refreshAssigned();
    save.addEventListener('click',async()=>{const picked=[...assigned.querySelectorAll('input:checked')].map(node=>node.value);if(select.value==='selected'&&!picked.length){status.textContent='請選擇至少一個錄取職務。';return;}save.disabled=true;status.textContent='儲存中…';try{data=await request('update',{id:item.id,status:select.value,assigned_roles:picked});$('#status').textContent='志工審核狀態已儲存。';render();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}});
  }
  return card;
}
function render(){renderSummary();const items=data.items||[],filter=$('#filter').value,shown=filter?items.filter(item=>item.status===filter):items;$('#count').textContent=`共 ${items.length} 筆，顯示 ${shown.length} 筆`;const root=$('#applications');root.replaceChildren();if(!shown.length){root.append(el('p','目前沒有符合條件的志工報名。','empty'));return;}for(const item of shown)root.append(renderCard(item));const id=new URLSearchParams(location.search).get('id');if(id){const card=document.getElementById(`application-${id}`);if(card){card.classList.add('focused');card.scrollIntoView({block:'center'});}}}
$('#filter').addEventListener('change',render);
async function start(){try{const access=await readAccess(db);if(!canOpen(access,'M+','heat_camp'))throw new Error('沒有熱火籃球營管理權限。');canEdit=canAction(access,'M+','heat_camp','edit');data=await request('list');$('#status').textContent='志工報名資料已更新。';render();}catch(error){$('#status').textContent=error.message;}}
start();
