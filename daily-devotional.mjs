import {LINE_MEMBER_ENDPOINT,MEMBER_LIFF_IDS} from './line-config.mjs';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),church=params.get('church')==='M+'?'M+':'M+';
const fromOctoberTree=params.get('preview')==='1'&&params.get('from')==='october-tree';
const state={token:'',accessToken:'',date:'',item:null,progress:[],preview:params.get('preview')==='1'};
const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const taipeiToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
const lines=value=>String(value||'').split(/\r?\n/).map(line=>line.replace(/^\s*(?:\d+[.、]|Q\d+:)\s*/,'').trim()).filter(Boolean);

async function api(action,extra={}){
  const response=await fetch(LINE_MEMBER_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000),body:JSON.stringify({action,church,idToken:state.token,accessToken:state.accessToken,...extra})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true){const error=new Error(data.error||'unavailable');error.code=data.error;throw error;}return data;
}
function streak(){const dates=new Set(state.progress.map(row=>row.devotional_date));let cursor=new Date((state.date||taipeiToday())+'T12:00:00+08:00'),count=0;while(dates.has(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(cursor))){count++;cursor.setDate(cursor.getDate()-1);}return count;}
function render(){const item=state.item,completed=state.progress.find(row=>row.devotional_date===state.date);$('#streak').textContent=state.preview?'預覽模式':`🌱 ${streak()} 天`;$('#status').textContent=state.preview?'頁面預覽｜不會儲存完成紀錄或改變審核狀態。':completed?'今天已完成，隨時可以回來重讀。':'慢慢讀，不趕進度；讓神的話停留在心裡。';$('#content').hidden=false;$('#empty').hidden=true;$('#content').innerHTML=`
  <section class="hero"><p class="eyebrow">${escape(item.month_theme)} · ${escape(item.week_theme)}</p><h1>${escape(item.devotional_title)}</h1><span class="reference">今日精選｜${escape(item.selected_scripture_reference)}</span><div class="reading-grid"><div><small>📖 今日讀經範圍</small><strong>${escape(item.roots_reading)}</strong></div>${item.branches_reading?`<div><small>🌿 延伸讀經範圍</small><strong>${escape(item.branches_reading)}</strong></div>`:''}${item.fruit_reading?`<div><small>💡 智慧讀經範圍</small><strong>${escape(item.fruit_reading)}</strong></div>`:''}</div></section>
  <section class="card"><h2>精選經文</h2>${item.scripture_is_excerpt?'<span class="excerpt">經文節錄</span>':''}<p class="scripture">${escape(item.scripture_text)}</p>${item.scripture_version?`<small>${escape(item.scripture_version)}</small>`:''}</section>
  <section class="card"><h2>經文背景</h2><div class="formatted">${escape(item.context_summary)}</div></section>
  <section class="card"><h2>今天記住三件事</h2><ol class="questions">${lines(item.key_points).map(value=>`<li>${escape(value)}</li>`).join('')}</ol></section>
  <section class="card"><h2>停下來想一想</h2><ol class="questions">${lines(item.reflection_questions).map(value=>`<li>${escape(value)}</li>`).join('')}</ol></section>
  <section class="card"><h2>今天的行動</h2><div class="formatted">${escape(item.life_application)}</div></section>
  <section class="card"><h2>回應禱告</h2><div class="formatted">${escape(item.response_prayer)}</div></section>
  ${fromOctoberTree?'<section id="october-journal" class="card reflection october-journal" aria-label="拾光手札"></section>':`<section class="card reflection"><h2>拾光手札</h2><textarea id="note" maxlength="1000" placeholder="寫下今天的亮光或禱告，只有你自己看得到。" ${state.preview?'disabled':''}>${escape(completed?.reflection_note||'')}</textarea><button id="complete" class="complete" ${completed||state.preview?'disabled':''}>${state.preview?'預覽模式不儲存':completed?'✓ 今天已完成':'完成今日靈修'}</button><p id="completion-message" class="completion-message" role="status"></p></section>`}`;
  if(fromOctoberTree){
    $('#status').textContent='2027 年 1 月 1 日・創世記試閱｜不會儲存完成紀錄，也不計入十月箴言進度。';
    const back=document.createElement('a');back.className='tree-return';back.href='tree-reading-october-test.html#devotional-invitation';back.textContent='返回箴言生命樹';back.addEventListener('click',returnToTree);$('#content').append(back);
    void import('./october-devotional-journal.mjs?v=20261010-tree-guide1').then(module=>module.mountOctoberJournal($('#october-journal'))).catch(()=>{$('#october-journal').textContent='手札暫時無法載入，請重新整理；靈修內容仍可閱讀。';});
  }
  if(!state.preview)$('#complete').onclick=complete;
}
async function complete(){const button=$('#complete');button.disabled=true;button.textContent='正在儲存…';try{const result=await api('devotional_complete',{date:state.date,note:$('#note').value.trim()});state.progress=state.progress.filter(row=>row.devotional_date!==state.date).concat(result.record);render();$('#completion-message').textContent='已完成今天的靈修，生命樹多了一天養分。';navigator.vibrate?.(35);}catch{button.disabled=false;button.textContent='完成今日靈修';$('#completion-message').textContent='暫時無法儲存，請檢查網路後再試。';}}
function memberLoginUrl(){
  const url=new URL(`https://liff.line.me/${MEMBER_LIFF_IDS[church]}`);
  url.searchParams.set('feature','devotional');
  const date=params.get('date');
  if(date)url.searchParams.set('date',date);
  return url.href;
}
function returnToTree(event){
  // Only the known same-origin reading page may use history; never accept an arbitrary return URL.
  try{const referrer=new URL(document.referrer);if(referrer.origin===location.origin&&referrer.pathname===new URL('tree-reading-october-test.html',location.href).pathname&&history.length>1){event.preventDefault();history.back();}}catch{}
}
async function start(){
  if(fromOctoberTree&&location.pathname.endsWith('/daily-devotional.html')){location.replace('tree-reading-october-test.html?view=devotional&church=M%2B&preview=1&from=october-tree');return;}
  if(fromOctoberTree){const back=$('.topbar a');back.href='tree-reading-october-test.html#devotional-invitation';back.setAttribute('aria-label','返回箴言生命樹');back.onclick=returnToTree;}

  try{
    if(state.preview){
      const response=await fetch('data/devotionals-2027-01.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('preview_unavailable');const data=await response.json();
      state.item=data.items?.[0];state.date=state.item?.devotional_date||'2027-01-01';
      if(!state.item)throw new Error('content_empty');
      render();return;
    }
    state.token=sessionStorage.getItem(`line-member-token:${church}`)||'';
    state.accessToken=sessionStorage.getItem(`line-member-access-token:${church}`)||'';
    if(!state.token&&!state.accessToken){location.replace(memberLoginUrl());return;}
    state.date=params.get('date')||taipeiToday();
    const data=await api('content',{feature:'devotional',date:state.date});
    if(data.launchPending){$('#status').hidden=true;$('#empty').hidden=false;return;}
    state.item=data.item;state.progress=data.progress||[];render();
  }catch(error){
    if(error.code==='login_required'){
      sessionStorage.removeItem(`line-member-token:${church}`);
      sessionStorage.removeItem(`line-member-access-token:${church}`);
      location.replace(memberLoginUrl());return;
    }
    $('#content').hidden=true;$('#empty').hidden=true;
    $('#status').textContent=error.code==='content_empty'?'今天的內容尚未核准發布。':'連線暫時中斷，請稍後重試。';
    const retry=document.createElement('button');retry.type='button';retry.textContent='重新載入';retry.onclick=()=>{retry.remove();void start();};$('#status').append(retry);
  }
}
start();
