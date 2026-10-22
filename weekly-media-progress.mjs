// Time is shown as elapsed duration, never converted into a completion percentage.
export function createMediaProgress(host){
  const make=(tag,className)=>Object.assign(document.createElement(tag),{className});
  const panel=make('div','weekly-media-progress'),heading=make('div','media-progress-heading'),spinner=make('span','media-activity'),title=make('strong','media-progress-title'),amount=make('span','media-progress-amount'),detail=make('p','media-progress-detail'),bar=make('progress','media-progress-bar'),footer=make('div','media-progress-footer'),note=make('span','media-progress-note'),elapsed=make('span','media-progress-elapsed');
  spinner.setAttribute('aria-hidden','true');
  for(let i=0;i<12;i++){const spoke=make('span','');spoke.style.setProperty('--spoke-angle',`${i*30}deg`);spoke.style.setProperty('--spoke-delay',`${(i-12)/12}s`);spinner.append(spoke);}
  title.setAttribute('role','status');title.setAttribute('aria-live','polite');elapsed.setAttribute('aria-hidden','true');bar.max=100;
  heading.append(spinner,title,amount);footer.append(note,elapsed);panel.append(heading,detail,bar,footer);host.replaceChildren(panel);host.hidden=true;
  let timer=null,started=0,active=false,accumulated=0,estimate=90,confirmed=null,shown=0,historyKey='',workKey='',learn=true,estimating=true,estimateOffset=0;
  const read=(storage,key,fallback)=>{try{return JSON.parse(window[storage].getItem(key))??fallback;}catch{return fallback;}};
  const write=(storage,key,value)=>{try{window[storage].setItem(key,JSON.stringify(value));}catch{}};
  const remove=(storage,key)=>{try{window[storage].removeItem(key);}catch{}};
  const total=()=>accumulated+(active?performance.now()-started:0);
  function paint(){
    if(confirmed===null){bar.removeAttribute('value');amount.textContent=estimating?'處理中':'等待開始';}
    else{shown=Math.min(99,confirmed);bar.value=shown;amount.textContent=`已確認 ${shown}%`;}
    bar.setAttribute('aria-label',title.textContent||'製作進度');bar.setAttribute('aria-valuetext',`${amount.textContent}，${detail.textContent}`);
  }
  function tick(){const seconds=Math.floor(total()/1000);elapsed.textContent=`已等待 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;if(estimating&&total()/1000>=estimate)note.textContent='等待較久，仍在查詢同一筆工作；請勿重複產生。';paint();}
  function stop(){const wasActive=active;if(active)accumulated+=performance.now()-started;if(timer!==null)clearInterval(timer);timer=null;active=false;if(workKey&&wasActive)write('sessionStorage',workKey,{milliseconds:accumulated,estimateOffset,estimating});}
  function update({label,description,percent,hint,estimateProgress}={}){
    if(estimateProgress!==undefined){if(!estimating&&estimateProgress)estimateOffset=total();estimating=estimateProgress;}
    if(label!==undefined&&title.textContent!==label)title.textContent=label;
    if(description!==undefined)detail.textContent=description;
    if(hint!==undefined)note.textContent=hint;
    if(Number.isFinite(percent))confirmed=Math.min(99,Math.max(confirmed??0,percent));
    paint();
  }
  return{
    get active(){return active;},
    start({history='media',baselineSeconds=60,workId='',recordHistory=true,...options}={}){
      stop();estimating=true;learn=recordHistory;historyKey=`weekly-media-duration:v1:${history}`;workKey=workId?`weekly-media-wait:v1:${history}:${workId}`:'';
      const samples=read('localStorage',historyKey,[]),durations=Array.isArray(samples)?samples.filter(v=>Number.isFinite(v)&&v>0&&v<=1800).slice(-8):[];
      estimate=Math.max(1,durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:baselineSeconds)+30;
      const stored=workKey?read('sessionStorage',workKey,null):null;
      accumulated=Math.max(0,Math.min(1800000,Number(stored?.milliseconds)||0));estimateOffset=Math.max(0,Number(stored?.estimateOffset)||0);estimating=stored?.estimating!==false;confirmed=null;shown=0;active=true;started=performance.now();host.hidden=false;panel.dataset.state='working';
      update({label:'製作中…',description:'',hint:'目前未提供可核對的百分比；收到工作結果後更新。',...options});tick();timer=setInterval(tick,1000);
    },
    update,
    finish(description='製作完成，請確認預覽。'){
      stop();const seconds=accumulated/1000,samples=read('localStorage',historyKey,[]);
      if(learn&&historyKey&&seconds>0&&seconds<=1800)write('localStorage',historyKey,[...(Array.isArray(samples)?samples.filter(v=>Number.isFinite(v)&&v>0&&v<=1800).slice(-7):[]),seconds]);
      if(workKey)remove('sessionStorage',workKey);panel.dataset.state='complete';title.textContent='製作完成';detail.textContent=description;note.textContent='';bar.value=100;amount.textContent='完成 100%';bar.setAttribute('aria-label','製作完成');bar.setAttribute('aria-valuetext',description);
    },
    pause(description='請繼續查詢同一筆工作。'){stop();panel.dataset.state='paused';update({label:'等待繼續查詢',description,hint:'進度已保留，請接續同一筆工作。'});},
    fail(description){stop();panel.dataset.state='error';update({label:'本次製作未完成',description,hint:'已停止等待，原有內容會保留。'});},
    reset(){stop();host.hidden=true;},
  };
}
