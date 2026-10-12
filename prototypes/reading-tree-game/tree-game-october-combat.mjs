// Active combat belongs to the October test only. There are no offline ticks.
export function createOctoberCombat({getState,getQuest,send,isSaving,renderAvatar,sound}) {
  if(document.body.dataset.octoberTest!=='true')return {start(){},stop(){},finish(){},busy:false};
  const $=s=>document.querySelector(s),stage=$('#quest-stage');
  const layer=document.createElement('div');layer.className='incoming-layer';layer.setAttribute('aria-hidden','true');layer.hidden=true;
  layer.innerHTML='<div class="incoming-shadow"><span class="shadow-art"></span></div><div class="incoming-projectile"></div><div class="incoming-defender"></div><div class="incoming-impact"></div><div class="incoming-numbers"></div>';
  stage.append(layer);
  const hud=document.createElement('section');hud.className='incoming-hud';hud.hidden=true;hud.setAttribute('aria-label','仇敵攻擊倒數');
  hud.innerHTML='<div><strong class="incoming-title">仇敵正在蓄力</strong><span class="incoming-countdown"></span></div><progress max="100" value="0" aria-label="下一次攻擊準備進度"></progress><p class="incoming-guide">可隨時關閉戰鬥回花園；離開後停止攻擊，成長與收藏會保留。</p><p class="incoming-status" role="status" aria-live="polite"></p>';
  $('#combat-life').after(hud);
  let session=null,timer=null,epoch=0,active=false,inFlight=false,lastAttack='',nextAt=0,clearFX=null;
  const interval=()=>getQuest()?.boss?5000:8000;
  function notice(text){hud.querySelector('.incoming-status').textContent=text;}
  function paintAttack(attack){
    if(!attack||attack.id===lastAttack)return;lastAttack=attack.id;
    layer.hidden=false;layer.dataset.boss=String(attack.boss);
    layer.querySelector('.incoming-defender').innerHTML=renderAvatar();
    const numbers=layer.querySelector('.incoming-numbers');numbers.replaceChildren();
    for(const [label,loss,kind] of [['信心 HP',attack.hp,'hp'],['盼望 MP',attack.mp,'mp']]){
      const line=document.createElement('strong');line.className='damage-'+kind;line.textContent=`${label} −${loss}`;numbers.append(line);
    }
    layer.classList.remove('is-striking');stage.classList.remove('counter-attack');
    requestAnimationFrame(()=>{layer.classList.add('is-striking');stage.classList.add('counter-attack');});
    sound('incoming');notice(`受到${attack.boss?' Boss ':''}攻擊：信心 HP −${attack.hp}、盼望 MP −${attack.mp}。`);
    clearTimeout(clearFX);clearFX=setTimeout(()=>{layer.hidden=true;layer.classList.remove('is-striking');},1500);
  }
  function exhausted(){
    const s=getState(),q=getQuest();if(!q||s.life.hp>0&&s.life.mp>=(q.boss?5:2))return false;
    active=false;clearInterval(timer);timer=null;hud.querySelector('.incoming-title').textContent='先回花園，補充力量';
    hud.querySelector('.incoming-countdown').textContent='攻擊已停止';
    $('#quest-action').disabled=true;$('#quest-options').querySelectorAll('button').forEach(b=>b.disabled=true);
    $('#quest-return').hidden=false;$('#quest-return').disabled=false;$('#quest-return').textContent='回花園讀經，恢復力量';
    notice('進度已保存。讀經補 HP +40、MP +20；澆水或寫手札補 MP +10。');
    return true;
  }
  async function tick(){
    const q=getQuest();
    if(!active||document.hidden||!q||q.complete||!$('#quest-dialog').open){stop();return;}
    if(exhausted())return;
    const remaining=Math.max(0,nextAt-Date.now());
    hud.querySelector('.incoming-countdown').textContent=`${Math.ceil(remaining/1000)} 秒`;
    hud.querySelector('progress').value=Math.min(100,100-remaining/interval()*100);
    hud.dataset.warning=String(remaining<=2000);
    if(remaining>0||inFlight||isSaving()||q.busy)return;
    inFlight=true;const stamp=epoch,ownSession=session;
    try{
      const result=await send('attack',{day:q.event.date,stage:q.event.index,session:ownSession});
      if(stamp!==epoch||getQuest()?.epoch!==q.epoch||document.hidden)return;
      const encounter=result.state.encounters[result.today];paintAttack(encounter.lastAttack);
      nextAt=Date.now()+Math.max(1000,interval()-(result.serverNow-encounter.combat.at));
      if(!exhausted()&&getState().life.hp<=20)notice('信心 HP 偏低，可以先回花園讀經或使用祝福小花。');
    }catch(e){if(stamp===epoch){notice(`攻擊暫停：${e.message}`);nextAt=Date.now()+interval();}}
    finally{inFlight=false;}
  }
  async function start(){
    stop(false);const q=getQuest();hud.hidden=!q?.encounter;
    if(!q?.encounter||q.complete||document.hidden)return;
    const stamp=++epoch;session=crypto.randomUUID();const ownSession=session;
    hud.dataset.warning='false';hud.querySelector('.incoming-title').textContent=q.boss?'Boss 正在蓄力 · HP −10／MP −6':'仇敵正在蓄力 · HP −5／MP −3';
    notice('正在準備戰鬥…');q.attackPreparing=true;
    try{
      // A foreground return may overlap the last acknowledged request. Wait
      // for that save without starting an attack countdown in the meantime.
      const waitingSince=Date.now();
      while(isSaving()){
        if(stamp!==epoch||document.hidden)return;
        if(Date.now()-waitingSince>35000)throw Error('連線尚未完成，請先回花園重新整理。');
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(stamp!==epoch||getQuest()?.epoch!==q.epoch||document.hidden)return;
      await send('engage',{day:q.event.date,stage:q.event.index,session:ownSession});
      if(stamp!==epoch||getQuest()?.epoch!==q.epoch||document.hidden)return;
      active=true;lastAttack=getState().encounters[q.event.date]?.lastAttack?.id||'';nextAt=Date.now()+interval();
      notice(`每 ${interval()/1000} 秒一次攻擊；使用軍裝另消耗 MP ${q.boss?5:2}。`);
      if(!exhausted()){timer=setInterval(()=>void tick(),250);void tick();}
    }catch(e){if(stamp===epoch)notice(`戰鬥尚未開始：${e.message} 可關閉後重新開啟。`);}
    finally{q.attackPreparing=false;}
  }
  function stop(notify=false){
    const old=session,q=getQuest();epoch++;active=false;session=null;clearInterval(timer);timer=null;clearTimeout(clearFX);layer.hidden=true;hud.dataset.warning='false';
    if(notify&&old&&q?.encounter&&!inFlight)void send('retreat',{day:q.event.date,session:old}).catch(()=>{});
  }
  function finish(){
    stop(false);hud.hidden=!getQuest()?.encounter;
    hud.querySelector('.incoming-title').textContent='這一回合，平安完成';
    hud.querySelector('.incoming-countdown').textContent='進度已保存';
    hud.querySelector('progress').value=100;
    notice('攻擊已停止。帶著剛才的亮光，繼續讀經或迎接下一個事件。');
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop(false);hud.querySelector('.incoming-countdown').textContent='已暫停';}else if($('#quest-dialog').open&&!getQuest()?.complete)void start();});
  window.addEventListener('pagehide',()=>stop(false));
  return {start,stop,finish,get busy(){return inFlight;}};
}
