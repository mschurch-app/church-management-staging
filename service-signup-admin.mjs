import {db,SUPABASE_URL} from './admin-db.mjs?v=20261009-stage4';
import {createMatchingDraft,mountMatchingBoard} from './service-matching-board.mjs?v=20261010-match-board1';

import {lockControls,workflowSummary,apiResult,uncertainWrite,reviewDialog,draftGuard} from './app-workflow.mjs?v=20261009-stage4';

const church='M+';
const $=selector=>document.querySelector(selector);
const status=$('#status'),overview=$('#overview'),tabs=$('#seasonTabs'),smartPanel=$('#smartPanel'),changePanel=$('#changePanel');
let payload={seasons:[],slots:[]},changeQueue={requests:[],is_final_reviewer:false},active=null,busy=false,recovery=false;

const labels={media:'影音',worship:'敬拜團',welcome:'接待',children:'兒童主日學',sound:'音控',projection_director:'投影字幕／導播',lighting:'燈光',worship_leader:'主領',assistant_worship_leader:'副主領',keyboard_1:'第一鍵盤',keyboard_2:'第二鍵盤',drums:'爵士鼓',guitar:'吉他',bass:'Bass',singer_1:'歌手一',singer_2:'歌手二',singer_3:'歌手三',welcome_1:'接待一',welcome_2:'接待二',children_teacher:'老師',children_assistant:'助手'};
const roleTargets={sound:'tech_sound',projection_director:'tech_video',lighting:'custom_f15e659f6a90065d',worship_leader:'worship_leader',assistant_worship_leader:'custom_9ce39850489c56cd',keyboard_1:'custom_321a786c791201d4',keyboard_2:'custom_5a2347d6f4712277',drums:'drums',guitar:'guitar',bass:'bass',singer_1:'custom_9462bfb6bd5d047b',singer_2:'custom_8111d3ff9bdab05c',singer_3:'custom_24781cd4004d4df5',welcome_1:'usher1',welcome_2:'usher2',children_teacher:'sunday_school',children_assistant:'sunday_school_ta'};
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
const fmt=date=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T12:00:00+08:00'));
function message(text,tone=''){status.textContent=text;status.dataset.tone=tone;}
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
const matchGuard=draftGuard(smartPanel);
let matchingBoard=null;
function clearMatchingBoard(){matchingBoard=null;matchGuard.clear();smartPanel.hidden=true;smartPanel.replaceChildren();$('.signup-admin').classList.remove('matching-open');overview.hidden=false;$('.workflow-toolbar').hidden=false;}
async function leaveMatchingBoard(){if(busy||recovery)return false;if(matchGuard.dirty){const accepted=await reviewDialog({title:'收起這份預排？',description:'預排人選尚未寫入正式班表。收起後，需要重新產生配對建議。',withNote:false,confirmLabel:'放棄預排'});if(accepted===null||busy||recovery)return false;}clearMatchingBoard();return true;}


function renderTabs(){
  tabs.replaceChildren();
  for(const season of payload.seasons){
    const button=el('button',season.title+(season.status==='open'?'｜開放中':''),'secondary');
    button.classList.toggle('active',season.id===active);
    button.type='button';button.disabled=recovery;button.onclick=async()=>{if(busy||recovery||season.id===active)return;if(matchingBoard&&!await leaveMatchingBoard())return;active=season.id;updateFilters();renderChangeRequests();render();};
    tabs.append(button);
  }
}

function renderChangeRequests(){
  const requests=(changeQueue.requests||[]).filter(request=>!request.season_id||request.season_id===active);changePanel.replaceChildren();changePanel.hidden=!requests.length;if(!requests.length)return;
  const head=el('div','','change-panel-head');head.append(el('div','服事調整審核','change-panel-title'),el('span',`${requests.length} 筆待處理`));changePanel.append(head);
  for(const request of requests){
    const card=el('article','','change-request'),copy=el('div'),actions=el('div','','change-actions');
    const stage=request.status==='leader_review'?'服事領袖初審':'鈺庭複審';
    copy.append(el('small',`${stage} · ${labels[request.ministry_key]||request.ministry_key}`),el('strong',`${request.member_name}｜${fmt(request.service_date)}｜${labels[request.role_key]||request.role_key}`),el('p',`${request.request_type==='cancel'?'申請取消':'申請調整'}：${request.member_note}`));
    if(request.leader_note)copy.append(el('p',`領袖協調紀錄：${request.leader_note}`,'review-note'));
    const approve=el('button',request.status==='leader_review'?'初審通過，送鈺庭':'複審核准','primary'),reject=el('button','退回申請','secondary');
    approve.type=reject.type='button';approve.onclick=()=>reviewChange(request,'approve');reject.onclick=()=>reviewChange(request,'reject');actions.append(approve,reject);card.append(copy,actions);changePanel.append(card);
  }
}

function render(){
  renderTabs();overview.replaceChildren();
  const season=payload.seasons.find(item=>item.id===active);
  if(!season){workflowSummary($('#workflow'),{title:'準備新的服事季度',description:payload.can_manage?'建立年度與季度後，系統會自動帶出主日與職務。':'目前沒有可查看的服事季度。'});overview.append(el('div','目前尚未建立季度。','empty-state'));return;}
  const head=el('header','','season-head'),copy=el('div'),actions=el('div','','season-actions');
  copy.append(el('h2',season.title),el('small',`${season.starts_on} ～ ${season.ends_on}`));
  const smart=el('button','智能配對・預排班表','smart-match-button secondary');
  smart.type='button';smart.disabled=recovery;smart.onclick=()=>openSmartMatch(smart);
  const state=document.createElement('select');
  for(const [value,label] of [['draft','草稿'],['open','開放登記'],['closed','停止登記'],['archived','封存']])state.append(new Option(label,value));
  state.value=season.status;state.disabled=!payload.can_manage||recovery;state.setAttribute('aria-label','季度開放狀態');
  state.onchange=()=>{const next=state.value;state.value=season.status;operation(()=>rpc('update_service_signup_season',{p_church:church,p_season:season.id,p_status:next}),'季度狀態已更新。');};
  actions.append(smart,state);head.append(copy,actions);overview.append(head);
  const slots=payload.slots.filter(slot=>slot.season_id===active&&slotMatches(slot)),dates=[...new Set(slots.map(slot=>slot.service_date))].sort();
  const all=payload.slots.filter(slot=>slot.season_id===active),pending=all.reduce((n,slot)=>n+slot.registrations.filter(person=>person.status==='registered').length,0),waiting=all.reduce((n,slot)=>n+slot.registrations.filter(person=>['waitlisted','offered'].includes(person.status)).length,0);
  workflowSummary($('#workflow'),{title:recovery?'請確認最新狀態':`${pending} 筆待確認 · ${waiting} 位候補／待回覆`,description:recovery?'請重新載入確認最新結果，再繼續操作。':'先檢視各主日的服事意願，再確認或協調安排；配對建議會保留正式班表已有的人員。',steps:['檢視意願','協調確認','正式班表'],active:pending?1:0});
  if(!slots.length)overview.append(el('p','沒有符合的服事，請調整日期、類別或狀態。','workflow-empty'));
  for(const date of dates){
    const section=el('section','','date-section');section.append(el('h3',fmt(date)));
    for(const ministry of ['media','worship','welcome','children']){
      const rows=slots.filter(slot=>slot.service_date===date&&slot.ministry_key===ministry);if(!rows.length)continue;
      const block=el('div','','ministry-block');block.append(el('h4',labels[ministry]));
      for(const slot of rows){
        const row=el('div','','slot-row'),name=el('strong',labels[slot.role_key]||slot.role_key),capacity=document.createElement('input'),open=el('button',slot.is_open?'開放':'關閉','secondary'),people=el('div','','people');
        capacity.type='number';capacity.min='1';capacity.max='20';capacity.value=slot.capacity;
        capacity.disabled=recovery||(!payload.can_manage&&!payload.scopes.includes('all')&&!payload.scopes.includes(ministry));
        capacity.setAttribute('aria-label',name.textContent+'名額');capacity.onchange=()=>saveSlot(slot,capacity,open);
        open.disabled=capacity.disabled;open.setAttribute('aria-label',`${name.textContent}：${slot.is_open?'開放中，點選關閉':'已關閉，點選開放'}`);open.onclick=()=>saveSlot(slot,capacity,open,!slot.is_open);
        const registered=slot.registrations.filter(person=>!['waitlisted','offered','declined','cancelled'].includes(person.status)),waiting=slot.registrations.filter(person=>person.status==='waitlisted'),offered=slot.registrations.filter(person=>person.status==='offered');
        people.append(el('span',registered.length?`登記／已確認：${registered.map(person=>person.name).join('、')}`:'尚未有人登記'));
        if(waiting.length)people.append(el('span',`候補：${waiting.map(person=>`${person.name}（第 ${person.queue_number} 位）`).join('、')}`,'person-wait'));
        if(offered.length)people.append(el('span',`等待候補確認：${offered.map(person=>person.name).join('、')}`,'person-wait'));
        for(const person of slot.registrations.filter(item=>item.status==='registered'&&!capacity.disabled)){
          const controls=el('div','','review-actions'),approve=el('button','確認排入','secondary'),decline=el('button','婉拒','secondary');
          approve.type=decline.type='button';approve.onclick=()=>reviewRegistration(person.id,'confirmed');decline.onclick=()=>reviewRegistration(person.id,'declined');
          controls.append(el('small',person.name),approve,decline);people.append(controls);
        }
        row.append(name,capacity,open,people);block.append(row);
      }
      section.append(block);
    }
    overview.append(section);
  }
}

async function openSmartMatch(button){
  if(busy||recovery)return;
  const seasonId=active;
  busy=true;const unlock=lockControls($('.signup-admin'));button.disabled=true;message('正在依照意願整理各主日的安排…');
  try{
    // Reload intentions as well as the complete season context; do not use the old 100-row schedule list.
    const [next,context]=await Promise.all([rpc('get_service_signup_admin',{p_church:church}),rpc('get_service_signup_match_context',{p_church:church,p_season:seasonId})]);
    if(active!==seasonId)return;
    payload=next;
    const season=payload.seasons.find(item=>item.id===seasonId);if(!season)throw new Error('此季度已變更，請重新載入。');
    const draft=createMatchingDraft({slots:payload.slots.filter(slot=>slot.season_id===seasonId),context,roleTargets,labels});
    render();
    matchingBoard=mountMatchingBoard(smartPanel,{draft,seasonTitle:season.title,labels,isLocked:()=>busy||recovery,onChange:()=>matchGuard.mark(),onClose:leaveMatchingBoard,onApply:async(ids,isCurrent)=>{
      if(busy||recovery)return;
      if(ids.length>300){message('單次可套用 300 筆，請先保留部分缺額，分次確認。','error');return;}
      const dates=new Set(draft.entries.filter(entry=>entry.candidates.some(person=>ids.includes(String(person.id)))).map(entry=>entry.service_date));
      const accepted=await reviewDialog({title:'確認這份服事預排？',description:`將 ${dates.size} 個主日、${ids.length} 筆人選寫入正式班表，並確認其登記。已有安排的人員會保留；期間若有人調整班表，系統會重新檢查並略過衝突。`,withNote:false,confirmLabel:'確認套用正式班表'});
      if(accepted===null||active!==seasonId||!isCurrent()||busy||recovery)return;
      await operation(async()=>{
        const result=await rpc('service_signup_apply_smart_match',{p_church:church,p_season:seasonId,p_registrations:ids});
        clearMatchingBoard();
        const skipped=result.skipped||0;
        return `已代入 ${result.applied||0} 筆服事安排。${skipped?`另有 ${skipped} 筆因班表變更、同日衝突或名額已滿未代入，請重新產生預排確認。`:'可到「正式班表」查看。'}`;
      });
    }});
    if(draft.selected.size)matchGuard.mark();
    $('.signup-admin').classList.add('matching-open');overview.hidden=true;$('.workflow-toolbar').hidden=true;smartPanel.hidden=false;
    smartPanel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    message(`預排已產生：建議 ${draft.selected.size} 筆，尚缺 ${draft.stats().gaps} 位。確認套用後才會儲存。`);
  }catch(error){message(error.message||'智能配對暫時無法使用，請重新載入後再試。','error');}
  finally{busy=false;unlock();matchingBoard?.render();}
}

function slotMatches(slot){const date=$('#service-date-filter').value,ministry=$('#ministry-filter').value,state=$('#registration-filter').value;return(!date||slot.service_date===date)&&(!ministry||slot.ministry_key===ministry)&&(!state||state==='pending'&&slot.registrations.some(person=>person.status==='registered')||state==='waiting'&&slot.registrations.some(person=>['waitlisted','offered'].includes(person.status))||state==='empty'&&!slot.registrations.some(person=>['registered','confirmed'].includes(person.status)));}
function updateFilters(){const filter=$('#service-date-filter'),value=filter.value;filter.replaceChildren(new Option('全部主日',''));for(const date of [...new Set(payload.slots.filter(slot=>slot.season_id===active).map(slot=>slot.service_date))].sort())filter.append(new Option(fmt(date),date));filter.value=[...filter.options].some(option=>option.value===value)?value:'';const ministry=$('#ministry-filter'),selected=ministry.value;ministry.replaceChildren(new Option('全部負責類別',''));for(const key of ['media','worship','welcome','children'])if(payload.can_manage||payload.scopes?.includes('all')||payload.scopes?.includes(key))ministry.append(new Option(labels[key],key));ministry.value=[...ministry.options].some(option=>option.value===selected)?selected:'';}
async function operation(write,success='設定已儲存。'){
  if(busy||recovery)return;busy=true;const unlock=lockControls($('.signup-admin'));message('正在儲存，請稍候…');let committed=false;
  try{const text=await write();committed=true;await load();message(typeof text==='string'?text:success,'success');}
  catch(error){if(committed||uncertainWrite(error)){recovery=true;$('.workflow-toolbar').hidden=false;render();renderChangeRequests();$('.signup-admin').querySelectorAll('button,input,select,textarea').forEach(control=>{if(control.id!=='service-reload')control.disabled=true;});message(committed?'操作已完成，但最新資料暫時無法載入。請重新載入確認結果。':'連線中斷，尚無法確認是否完成。請重新載入確認結果，再進行操作。','error');}else message(String(error.message||'').includes('registration_unavailable')?'登記資料已變更。請收起預排並重新載入，再產生建議。':String(error.message||'').includes('forbidden')?'沒有此項操作權限。':String(error.message||'').includes('unique')?'這一季已經建立，請重新載入查看。':'操作未完成，畫面保留原設定。請稍後重試。','error');}
  finally{busy=false;unlock();if(recovery)$('.signup-admin').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=control.id!=='service-reload';});}
}
async function saveSlot(slot,capacity,button,nextOpen=slot.is_open){
  if(busy||recovery){capacity.value=slot.capacity;return;}const count=Number(capacity.value);capacity.value=slot.capacity;
  if(!Number.isInteger(count)||count<1||count>20){message('名額請填寫 1 到 20 的整數。','error');return;}
  await operation(()=>rpc('update_service_signup_slot',{p_church:church,p_slot:slot.id,p_capacity:count,p_open:nextOpen}),'名額設定已儲存。');
}
async function adminApi(body){const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error('login_required');const response=await fetch(`${SUPABASE_URL}/functions/v1/service-signup-admin`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},body:JSON.stringify({...body,church}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)}),result=await apiResult(response);if(!response.ok||!result.ok)throw new Error(result.error||'unavailable');return result;}
async function reviewRegistration(id,nextStatus){if(busy||recovery)return;if(nextStatus==='declined'){const accepted=await reviewDialog({title:'婉拒這次服事登記？',description:'將釋出本次名額；有候補時依既有規則邀請下一位。',withNote:false,confirmLabel:'確認婉拒'});if(accepted===null)return;}await operation(()=>adminApi({registrationId:id,status:nextStatus}),nextStatus==='confirmed'?'已確認服事安排。':'已婉拒並釋出名額，候補將依順序處理。');}
async function reviewChange(request,decision){if(busy||recovery)return;const note=await reviewDialog({title:decision==='approve'?'確認服事調整':'退回服事申請',description:`${request.member_name}｜${fmt(request.service_date)}｜${labels[request.role_key]||request.role_key}`,label:decision==='approve'?'協調／核准說明（選填）':'退回原因（必填）',required:decision!=='approve',confirmLabel:decision==='approve'?'確認通過':'退回申請'});if(note===null)return;await operation(async()=>{const result=await adminApi({action:'change_review',requestId:request.id,decision,note});return result.status==='admin_review'?'初審完成，已交複審。':result.status==='approved'?'複審核准完成。':'申請已退回。';});}
async function load(){const [next,queue]=await Promise.all([rpc('get_service_signup_admin',{p_church:church}),rpc('get_service_signup_change_requests',{p_church:church})]);payload=next;changeQueue=queue;active=payload.seasons.some(season=>season.id===active)?active:payload.seasons[0]?.id||null;recovery=false;$('#create').hidden=!payload.can_manage;if(!payload.seasons.length)$('#create').open=true;updateFilters();renderChangeRequests();render();}
async function reload(){if(busy)return;if(matchingBoard&&!recovery&&!await leaveMatchingBoard())return;clearMatchingBoard();busy=true;const unlock=lockControls($('.signup-admin'));message('正在載入服事意願…');try{await load();message(payload.can_manage?'全部服事類別已載入。':`已載入負責類別：${payload.scopes.map(scope=>labels[scope]||scope).join('、')}`,'success');}catch(error){recovery=true;if(error.message?.includes('forbidden')){payload={seasons:[],slots:[],scopes:[],can_manage:false};changeQueue={requests:[]};$('#create').hidden=true;overview.replaceChildren();tabs.replaceChildren();changePanel.hidden=true;smartPanel.hidden=true;}message(error.message?.includes('forbidden')?'沒有主日服事管理權限。':'無法載入服事意願，請重新載入。','error');}finally{busy=false;unlock();if(recovery)$('.signup-admin').querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=control.id!=='service-reload';});}}
$('#year').value=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Taipei'}).format(new Date()))+1;$('#quarter').value='1';
$('#createQuarter').onclick=()=>{const year=Number($('#year').value),quarter=Number($('#quarter').value);if(!Number.isInteger(year)||year<2026||year>2100||![1,2,3,4].includes(quarter)){message('請確認年度與季度。','error');return;}operation(()=>rpc('create_service_signup_quarter',{p_church:church,p_year:year,p_quarter:quarter}),'季度與所有主日職務已建立。');};
$('#service-reload').onclick=reload;for(const id of ['service-date-filter','ministry-filter','registration-filter'])$('#'+id).onchange=()=>{if(!busy&&!recovery)render();};reload();
