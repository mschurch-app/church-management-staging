import {LINE_MEMBER_ENDPOINT,MEMBER_LIFF_IDS} from './line-config.mjs';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),church=params.get('church')==='M+'?'M+':'M+';
const state={token:'',date:'',item:null,progress:[]};
const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const taipeiToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
const lines=value=>String(value||'').split(/\r?\n/).map(line=>line.replace(/^\s*(?:\d+[.、]|Q\d+:)\s*/,'').trim()).filter(Boolean);

async function api(action,extra={}){
  const response=await fetch(LINE_MEMBER_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000),body:JSON.stringify({action,church,idToken:state.token,...extra})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true){const error=new Error(data.error||'unavailable');error.code=data.error;throw error;}return data;
}
function streak(){const dates=new Set(state.progress.map(row=>row.devotional_date));let cursor=new Date((state.date||taipeiToday())+'T12:00:00+08:00'),count=0;while(dates.has(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(cursor))){count++;cursor.setDate(cursor.getDate()-1);}return count;}
function render(){const item=state.item,completed=state.progress.find(row=>row.devotional_date===state.date);$('#streak').textContent=`🌱 ${streak()} 天`;$('#status').textContent=completed?'今天已完成，隨時可以回來重讀。':'慢慢讀，不趕進度；讓神的話停留在心裡。';$('#content').hidden=false;$('#empty').hidden=true;$('#content').innerHTML=`
  <section class="hero"><p class="eyebrow">${escape(item.month_theme)} · ${escape(item.week_theme)}</p><h1>${escape(item.devotional_title)}</h1><span class="reference">${escape(item.selected_scripture_reference)}</span><div class="reading-grid"><div><small>🌳 ROOTS</small><strong>${escape(item.roots_reading)}</strong></div><div><small>🌿 BRANCHES</small><strong>${escape(item.branches_reading||'—')}</strong></div><div><small>🍎 FRUIT</small><strong>${escape(item.fruit_reading||'—')}</strong></div></div></section>
  <section class="card"><h2>精選經文</h2>${item.scripture_is_excerpt?'<span class="excerpt">經文節錄</span>':''}<p class="scripture">${escape(item.scripture_text)}</p>${item.scripture_version?`<small>${escape(item.scripture_version)}</small>`:''}</section>
  <section class="card"><h2>經文背景</h2><div class="formatted">${escape(item.context_summary)}</div></section>
  <section class="card"><h2>今天記住三件事</h2><ol class="questions">${lines(item.key_points).map(value=>`<li>${escape(value)}</li>`).join('')}</ol></section>
  <section class="card"><h2>停下來想一想</h2><ol class="questions">${lines(item.reflection_questions).map(value=>`<li>${escape(value)}</li>`).join('')}</ol></section>
  <section class="card"><h2>今天的行動</h2><div class="formatted">${escape(item.life_application)}</div></section>
  <section class="card"><h2>回應禱告</h2><div class="formatted">${escape(item.response_prayer)}</div></section>
  <section class="card reflection"><h2>我的拾光</h2><textarea id="note" maxlength="1000" placeholder="寫下一句今天的領受，只有你自己看得到。">${escape(completed?.reflection_note||'')}</textarea><button id="complete" class="complete" ${completed?'disabled':''}>${completed?'✓ 今天已完成':'完成今日靈修'}</button><p id="completion-message" class="completion-message" role="status"></p></section>`;
  $('#complete').onclick=complete;
}
async function complete(){const button=$('#complete');button.disabled=true;button.textContent='正在儲存…';try{const result=await api('devotional_complete',{date:state.date,note:$('#note').value.trim()});state.progress=state.progress.filter(row=>row.devotional_date!==state.date).concat(result.record);render();$('#completion-message').textContent='已完成今天的靈修，生命樹多了一天養分。';navigator.vibrate?.(35);}catch{button.disabled=false;button.textContent='完成今日靈修';$('#completion-message').textContent='暫時無法儲存，請檢查網路後再試。';}}
async function start(){try{await window.liff.init({liffId:MEMBER_LIFF_IDS[church]});if(!window.liff.isLoggedIn()){window.liff.login({redirectUri:location.href});return;}state.token=window.liff.getIDToken()||'';if(!state.token)throw new Error('login_required');state.date=params.get('date')||taipeiToday();const data=await api('content',{feature:'devotional',date:state.date});if(data.launchPending){$('#status').hidden=true;$('#empty').hidden=false;return;}state.item=data.item;state.progress=data.progress||[];render();}catch(error){$('#content').hidden=true;$('#empty').hidden=false;$('#status').textContent=error.code==='content_empty'?'今天的內容尚未核准發布。':'連線暫時中斷，請稍後重新整理。';}}
start();
