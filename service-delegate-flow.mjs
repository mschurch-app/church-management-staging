const groups={keyboard:['keyboard_1','keyboard_2'],singer:['singer_1','singer_2','singer_3'],welcome:['welcome_1','welcome_2']};
const roleKey=key=>Object.keys(groups).find(group=>groups[group].includes(key))||key;
const activeStatuses=new Set(['registered','confirmed','waitlisted','offered']);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function eligiblePeriods(data,day=today(),now=Date.now()){
 return (data.seasons||[]).filter(s=>s.status==='open'&&(!s.opens_at||Date.parse(s.opens_at)<=now)&&(!s.closes_at||Date.parse(s.closes_at)>now)&&(data.slots||[]).some(slot=>String(slot.season_id)===String(s.id)&&slot.is_open&&slot.service_date>=day)).sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
}
const node=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
const labels={media:'影音',worship:'敬拜團',welcome:'接待',children:'兒童主日學',sound:'音控',projection_director:'投影字幕／導播',lighting:'燈光',worship_leader:'主領',assistant_worship_leader:'副主領',keyboard:'鍵盤',drums:'爵士鼓',guitar:'吉他',bass:'Bass',singer:'歌手',children_teacher:'老師',children_assistant:'助手'};
export function mountServiceDelegateFlow(root,{searchMembers,onSubmit,isLocked=()=>false}){
 let data={seasons:[],slots:[]},period=null,step=1,roleIndex=0,member=null,query='',candidates=[],searchVersion=0,working=false,notice='',consent=false;
 const ministries=new Set(),roles=new Set(),dates=new Map();
 const locked=()=>working||isLocked();
 const slots=()=>data.slots.filter(s=>String(s.season_id)===String(period)&&s.is_open&&s.service_date>=today());
 const roleSlots=role=>slots().filter(s=>roleKey(s.role_key)===role);
 const choices=()=>[...roles].flatMap(role=>[...(dates.get(role)||[])].map(service_date=>({role_key:role,service_date}))).sort((a,b)=>a.service_date.localeCompare(b.service_date));
 function button(text,action,{disabled=false,selected,cls='secondary'}={}){const b=node('button',text,cls);b.type='button';b.disabled=locked()||disabled;if(selected!==undefined)b.setAttribute('aria-pressed',String(selected));b.onclick=()=>{if(!locked())action();};return b;}
 function field(text,input){const l=node('label',text);l.append(input);return l;}
 function go(next){step=next;notice='';render();root.querySelector('h3')?.focus({preventScroll:true});}
 function clearDates(){dates.clear();consent=false;}
 function render(){
  root.replaceChildren();root.className='delegate-flow';root.setAttribute('aria-busy',String(working));
  const periods=eligiblePeriods(data);
  if(!periods.length){root.append(node('p','目前沒有開放且有可代填日期的期別。請服事管理者先確認期別與名額開放狀態。','delegate-notice'));return;}
  const progress=node('ol','','delegate-steps');['選會友與類別','選服事項目','多選主日日期','確認送出'].forEach((text,i)=>{const li=node('li',`${i+1} ${text}`);if(i+1===step)li.setAttribute('aria-current','step');progress.append(li);});root.append(progress);
  const h=node('h3',['選擇會友與服事類別','選擇願意參與的項目','選擇方便的主日','確認代填內容'][step-1]);h.tabIndex=-1;root.append(h);
  if(notice){const n=node('p',notice,'delegate-notice');n.setAttribute('role','status');root.append(n);}
  if(step===1){
   const season=node('select');season.setAttribute('aria-label','代填期別');for(const p of periods)season.append(new Option(p.title,p.id));season.value=String(period);season.disabled=locked();season.onchange=()=>{period=season.value;member=null;candidates=[];ministries.clear();roles.clear();clearDates();searchVersion++;render();};root.append(field('代填期別',season));
   root.append(node('p','不需要 LINE。請先從名冊選擇會友，再依前台流程複選服事項目與日期。'));
   const input=node('input');input.type='search';input.maxLength=80;input.value=query;input.setAttribute('aria-label','查詢會友姓名');input.placeholder='輸入姓名或部分姓名';input.disabled=locked();
   const memberSelect=node('select');memberSelect.setAttribute('aria-label','選擇代填會友');memberSelect.append(new Option('請先查詢並選擇會友',''));for(const p of candidates)memberSelect.append(new Option(`${p.name}${p.group_name?' · '+p.group_name:''}（編號 ${p.id}）`,p.id));memberSelect.value=String(member?.id||'');memberSelect.disabled=locked();
   const next=button('下一步：選服事項目',()=>go(2),{disabled:!member||!ministries.size});
   input.oninput=()=>{query=input.value;member=null;candidates=[];searchVersion++;memberSelect.replaceChildren(new Option('請重新查詢並選擇會友',''));next.disabled=true;clearDates();};
   memberSelect.onchange=()=>{member=candidates.find(p=>String(p.id)===memberSelect.value)||null;clearDates();next.disabled=!member||!ministries.size||locked();};
   root.append(field('會友姓名',input),button('查詢會友',async()=>{
    if(!query.trim())return;const version=++searchVersion;working=true;notice='正在查詢會友…';member=null;render();
    try{const result=await searchMembers(slots()[0].id,query.trim());if(version!==searchVersion)return;candidates=result.members||[];notice=candidates.length?(result.has_more?'結果較多，請輸入更完整姓名。':'請核對姓名與小組，選擇正確會友。'):'查無會友，請先到會友名冊建立資料。';}
    catch{if(version===searchVersion)notice='查詢失敗，請稍後重試。';}
    finally{working=false;render();}
   }),field('選擇會友',memberSelect),node('h4','想參與哪些服事？可複選'));
   const grid=node('div','','delegate-choice-grid');for(const ministry of [...new Set(slots().map(s=>s.ministry_key))])grid.append(button(labels[ministry]||ministry,()=>{if(ministries.has(ministry)){ministries.delete(ministry);for(const role of [...roles])if(roleSlots(role).some(s=>s.ministry_key===ministry)){roles.delete(role);dates.delete(role);}}else ministries.add(ministry);render();},{selected:ministries.has(ministry)}));root.append(grid,next);
  }else if(step===2){
   const grid=node('div','','delegate-choice-grid');for(const role of [...new Set(slots().filter(s=>ministries.has(s.ministry_key)).map(s=>roleKey(s.role_key)))])grid.append(button(labels[role]||role,()=>{roles.has(role)?(roles.delete(role),dates.delete(role)):roles.add(role);render();},{selected:roles.has(role)}));root.append(node('p','可複選。鍵盤、歌手及接待沿用前台方式，由系統分配編號名額。'),grid,button('上一步',()=>go(1)),button('下一步：多選日期',()=>{roleIndex=0;go(3);},{disabled:!roles.size}));
  }else if(step===3){
   const role=[...roles][roleIndex],selected=dates.get(role)||new Set(),list=node('div','','delegate-dates');root.append(node('h4',`${labels[role]||role}（${roleIndex+1}／${roles.size}）`),node('p','可多選日期。同一天只登記一項服事；額滿可候補。'));
   for(const date of [...new Set(roleSlots(role).map(s=>s.service_date))].sort()){
    const otherSelected=[...dates].some(([key,values])=>key!==role&&values.has(date));
    const existing=data.slots.some(s=>s.service_date===date&&roleKey(s.role_key)!==role&&s.registrations?.some(p=>String(p.member_id)===String(member.id)&&activeStatuses.has(p.status)));
    const matches=roleSlots(role).filter(s=>s.service_date===date),capacity=matches.reduce((n,s)=>n+Number(s.capacity),0),taken=matches.reduce((n,s)=>n+(s.registrations||[]).filter(p=>['registered','confirmed','offered'].includes(p.status)).length,0),blocked=otherSelected||existing;
    const label=`${date} · ${blocked?'當天已有其他服事':selected.has(date)?'已選':taken>=capacity?'額滿，可候補':'可登記'}`;
    list.append(button(label,()=>{selected.has(date)?selected.delete(date):selected.add(date);dates.set(role,selected);consent=false;render();},{disabled:blocked,selected:selected.has(date)}));
   }
   root.append(list,node('p',`此項已選 ${selected.size} 個主日`),button('上一步',()=>{roleIndex?roleIndex--:step=2;render();}),button(roleIndex<roles.size-1?'下一項服事':'確認全部選擇',()=>{if(roleIndex<roles.size-1){roleIndex++;render();}else go(4);},{disabled:!selected.size}));
  }else{
   root.append(node('p',`代填會友：${member.name} · ${eligiblePeriods(data).find(s=>String(s.id)===String(period))?.title||''}`));const list=node('ul');for(const c of choices())list.append(node('li',`${c.service_date} · ${labels[c.role_key]||c.role_key}`));root.append(list,node('p',`共 ${choices().length} 個主日，將一次送出；任一筆不符條件時整批保留，請修正後再送出。`));
   const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=consent;checkbox.disabled=locked();const send=button('確認並一次代填登記',async()=>{
    working=true;notice='正在一次送出全部登記…';render();try{const result=await onSubmit({season:Number(period),member:Number(member.id),choices:choices()});if(!result){notice='尚未完成，請查看頁面上方訊息；選擇內容已保留。';return;}step=1;roles.clear();ministries.clear();dates.clear();consent=false;notice=`已完成 ${result.registrations.length} 筆；候補 ${result.registrations.filter(r=>r.status==='waitlisted').length} 筆。`;}
    catch{notice='連線或狀態已變更，請先重新載入核對；選擇內容已保留。';}finally{working=false;render();}
   },{disabled:!consent});checkbox.onchange=()=>{consent=checkbox.checked;send.disabled=!consent||locked();};root.append(field('我已確認本人同意上述全部服事日期',checkbox),button('返回修改日期',()=>{roleIndex=roles.size-1;go(3);}),send);
  }
 }
 return {update(next){if(next===data)return;data=next;const periods=eligiblePeriods(data);if(!periods.some(s=>String(s.id)===String(period))){period=periods[0]?.id||null;step=1;member=null;candidates=[];roles.clear();ministries.clear();dates.clear();}render();},refresh:render,clear(){member=null;candidates=[];query='';step=1;roles.clear();ministries.clear();dates.clear();searchVersion++;render();}};
}
