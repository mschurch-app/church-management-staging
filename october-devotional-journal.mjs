import {OCTOBER_TEST_API,OCTOBER_TEST_LIFF_ID} from './tree-reading-october-test-config.mjs?v=20260929-login-fallback';

// October notes stay in their original, LINE-verified store. Preview content
// dates never become journal dates or devotional completion records.
export async function mountOctoberJournal(host){
  const $=selector=>host.querySelector(selector);
  const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');};
  const date=today();let token='',notes=[],busy=false,draft='',canWrite=false;
  host.innerHTML=`<h2>拾光手札</h2><p class="journal-context">記錄日期：${date} · 十月試讀</p><p class="journal-context">一月內容為試閱；手札記在今天，不增加靈修完成或澆水進度。</p><label for="reflection-note">今天的亮光／禱告</label><textarea id="reflection-note" maxlength="500" rows="4" placeholder="今天，神的話讓我想到……" disabled></textarea><button id="save-reflection" class="complete" type="button" disabled>珍藏這份拾光 🦋</button><p id="reflection-status" class="completion-message" role="status">正在確認你的手札…</p><details class="journal-history"><summary>翻閱我的拾光手札 <span id="reflection-book-count">0 則</span></summary><div id="journal-entries"></div></details>`;
  const status=text=>{$('#reflection-status').textContent=text;};
  function renderHistory(){
    $('#reflection-book-count').textContent=`${notes.length} 則`;
    const entries=$('#journal-entries');entries.replaceChildren();
    if(!notes.length){const p=document.createElement('p');p.textContent='還沒有收藏，從今天開始吧。';entries.append(p);return;}
    for(const entry of [...notes].sort((a,b)=>b.reading_date.localeCompare(a.reading_date))){
      const article=document.createElement('article'),heading=document.createElement('h3'),copy=document.createElement('p');
      heading.textContent=entry.reading_date;copy.textContent=entry.note;article.append(heading,copy);entries.append(article);
    }
  }
  async function api(action,extra={}){
    const response=await fetch(OCTOBER_TEST_API,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({action,...extra})});
    const out=await response.json();
    if(!response.ok||out.error||out.ok===false)throw Error(out.error==='read_first'?'請先完成今天的讀經，再回來收藏。':'連線暫時中斷，請重試；已填內容會保留。');
    return out;
  }
  $('#reflection-note').addEventListener('input',()=>{try{if(draft)sessionStorage.setItem(draft,$('#reflection-note').value);}catch{}});
  $('#save-reflection').onclick=async()=>{
    if(busy||!canWrite)return;
    const note=$('#reflection-note').value.trim();if(!note){status('先寫下一句亮光或禱告，再收藏吧。');$('#reflection-note').focus();return;}
    if(date!==today()){canWrite=false;$('#save-reflection').disabled=true;status('日期已更新，請重新載入再寫今天的手札；已填內容仍保留。');return;}
    busy=true;$('#save-reflection').disabled=true;$('#save-reflection').textContent='正在收藏…';host.setAttribute('aria-busy','true');status('正在儲存今天的拾光…');
    // Lock the captured text while saving; failures restore the same draft.
    $('#reflection-note').disabled=true;
    try{
      const out=await api('journal_save',{readingDate:date,note});
      if(out.note?.reading_date!==date||out.note?.note!==note)throw Error('尚未確認收藏結果，請重試或重新載入確認。');
      notes=notes.filter(row=>row.reading_date!==date).concat(out.note);renderHistory();
      try{if(draft)sessionStorage.removeItem(draft);sessionStorage.setItem('october-journal-updated','1');}catch{}
      status('拾光已收藏，只有你自己看得到。');
    }catch(error){status(error.name==='TimeoutError'||error.name==='AbortError'?'等待過久，請重試；已填內容會保留。':error.message);}
    finally{busy=false;$('#reflection-note').disabled=false;$('#save-reflection').disabled=false;$('#save-reflection').textContent='珍藏這份拾光 🦋';host.setAttribute('aria-busy','false');}
  };
  async function load(){
    try{
      await window.liff.init({liffId:OCTOBER_TEST_LIFF_ID});
      if(!window.liff.isInClient()||!window.liff.isLoggedIn()||!(token=window.liff.getIDToken()||''))throw Error('請從LINE的箴言生命樹入口開啟，才能查看自己的手札。');
      const out=await api('me'),subject=out.participant?.line_subject;
      if(typeof subject!=='string'||!/^U[0-9a-f]{32}$/.test(subject)||!Array.isArray(out.notes)||!Array.isArray(out.records))throw Error('手札資料不完整，請重試。');
      notes=out.notes;draft=`october-devotional-journal:${subject}:${date}`;
      let savedDraft='';try{savedDraft=sessionStorage.getItem(draft)||'';}catch{}
      $('#reflection-note').value=savedDraft||notes.find(row=>row.reading_date===date)?.note||'';
      canWrite=out.records.some(row=>row.reading_date===date);
      $('#reflection-note').disabled=!canWrite;$('#save-reflection').disabled=!canWrite;renderHistory();
      status(canWrite?'今天的亮光與禱告，就收藏在這裡。':'請先完成今天的讀經，再回來寫手札；過去的收藏仍可翻閱。');
    }catch(error){
      status(error.message);const retry=document.createElement('button');retry.type='button';retry.className='journal-retry';retry.textContent='重新連線手札';retry.onclick=()=>{retry.remove();status('正在確認你的手札…');void load();};$('#reflection-status').append(retry);
    }
  }
  await load();
}
