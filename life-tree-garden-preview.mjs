import {applyAppIcon, createAppIcon} from './app-icons.mjs';

// A self-contained interaction prototype. It imports no identity or data client.
const $ = selector => document.querySelector(selector);
const dialog = $('#garden-dialog');
const specs = {
  typhoon:{icon:'tree-raincoat',label:'穿上雨衣',title:'下雨了，陪小樹躲躲雨。',description:'點小樹旁的雨衣，替它擋住風雨。',condition:'風雨來了，需要你的陪伴',success:'雨衣穿好了，風雨慢慢停了。'},
  worm:{icon:'tree-spray',label:'保護嫩葉',title:'蟲蟲來了，保護新長的嫩葉。',description:'點小樹旁的噴瓶，幫嫩葉趕走蟲蟲。',condition:'嫩葉有蟲蟲，來幫幫忙',success:'蟲蟲離開了，嫩葉安心舒展。'},
  wind:{icon:'tree-support',label:'彼此扶持',title:'風有點大，我們一起站穩。',description:'點兩個人搭肩的道具，一起扶持小樹。',condition:'強風吹來，我們一起站穩',success:'搭著肩，彼此扶持，風也變小了。'},
  trouble:{icon:'tree-broom',label:'整理落枝',title:'整理一下，讓新芽有空間。',description:'點小樹旁的掃把，把落枝輕輕掃開。',condition:'地上有落枝，一起整理',success:'落枝掃乾淨了，新芽有空間生長。'}
};
const state = {readDates:new Set(),waterDates:new Set(),pendingDate:'',challenge:'',busy:false,effect:'',stars:3,journal:'',sound:false};
let animationTimer, feedbackTimer, lastFocus, music, effectAudio, audioVersion=0;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(node=>applyAppIcon(node,node.dataset.icon));}
function flowers(points,id){return points.map(([x,y],i)=>`<g transform="translate(${x} ${y})"><g class="flower-reveal" style="animation-delay:${i*.09}s"><g fill="#fff9d9" stroke="#f0d5b1" stroke-width="1"><ellipse cy="-7" rx="5" ry="7"/><ellipse cx="7" rx="7" ry="5"/><ellipse cy="7" rx="5" ry="7"/><ellipse cx="-7" rx="7" ry="5"/></g><circle r="4" fill="url(#gold-${id})"/></g></g>`).join('');}
function treeShape(id,stage=2){
  if(stage===1)return `<g><ellipse cx="400" cy="660" rx="91" ry="20" fill="#6c8b4c" opacity=".18"/><path d="M398 649Q412 584 395 527" fill="none" stroke="#6f9151" stroke-width="12" stroke-linecap="round"/><g class="tree-crown"><path d="M398 566Q291 578 304 485Q391 475 398 566" fill="url(#leaf0-${id})"/><path d="M401 551Q505 554 489 458Q403 465 401 551" fill="url(#leaf1-${id})"/><path d="m397 564-68-58m73 43 64-65" stroke="#d5e6ac" stroke-width="4" stroke-linecap="round" fill="none"/></g><path d="M365 660q-16-23-31-7 9 18 31 7" fill="#80a15d"/></g>`;
  const mature=stage>=2,scale=stage===1?.48:stage===2?.84:stage===5?1.12:stage===4?1.04:1;
  const leaves=[[-78,1,64],[-113,-62,65],[97,-24,68],[114,-81,63],[-66,-117,72],[55,-134,73],[3,-70,90],[-34,-35,70],[52,-28,72],[-22,-151,64]];
  return `<g transform="translate(400 650) scale(${scale}) translate(-400 -650)"><ellipse cx="405" cy="656" rx="132" ry="27" fill="#466f3b" opacity=".16"/>
    <path d="M375 654Q393 596 388 499L383 368Q398 355 408 372L411 497Q409 590 432 654Z" fill="url(#bark-${id})" stroke="#8c603d" stroke-width="2"/>
    <path d="M397 638Q399 520 396 421M400 513q-55-25-86-71M405 484q54-16 85-65" fill="none" stroke="#e3b478" stroke-width="5" opacity=".6" stroke-linecap="round"/>
    <path d="M395 502Q356 478 322 428M405 476Q450 456 486 418" fill="none" stroke="#9d7248" stroke-width="14" stroke-linecap="round"/>
    <g class="tree-crown" filter="url(#soft-${id})">${leaves.map(([x,y,r],i)=>`<g><circle cx="${400+x}" cy="${391+y}" r="${r}" fill="url(#leaf${i%3}-${id})"/><ellipse cx="${386+x}" cy="${371+y}" rx="${r*.33}" ry="${r*.18}" fill="#edfac2" opacity=".27" transform="rotate(-25 ${386+x} ${371+y})"/><path d="M${390+x} ${403+y}q15 8 28-1" fill="none" stroke="#456d3d" stroke-width="2" opacity=".13"/></g>`).join('')}
    ${stage>=3?flowers([[342,300],[472,337],[392,405],[309,369],[446,245],[365,238]],id):''}
    ${stage>=4?[[340,375],[470,385],[425,280],[380,340]].map(([x,y])=>`<g transform="translate(${x} ${y})"><path d="M0-10q5-8 12-5" stroke="#416335" stroke-width="4" fill="none"/><circle r="14" fill="url(#fruit-${id})"/><ellipse cx="-5" cy="-5" rx="4" ry="6" fill="#fff9dc" opacity=".7"/></g>`).join(''):''}
    ${mature?'<path d="M379 445q7 6 15 0m19-3q7 6 14-1" stroke="#365638" opacity=".32" fill="none" stroke-width="3" stroke-linecap="round"/>':''}</g>
    <path d="M342 657q-14-30-34-11 4 24 34 11M457 654q17-28 32-7-7 18-32 7" fill="#68954e"/><path d="m324 651 21 7m129-9-18 7" stroke="#c6dd92" stroke-width="2"/>
  </g>`;
}
function illustration({id='main',stage=2,challenge='',effect='',mini=false}={}){
  const storm=challenge==='typhoon',wind=challenge==='wind';
  const clouds=storm?'#68858a':'#fffcdf';
  const leaf=[["#d4e7a0","#91b267","#527d4e"],["#c7e092","#83aa5c","#426e47"],["#e3ecaf","#a5bc6b","#668b4e"]];
  const grass=Array.from({length:34},(_,i)=>{const x=(i*173+43)%800,y=585+(i*47)%195;return `<path d="m${x} ${y} 1-9m0 9-5-5m5 5 5-6" stroke="${i%2?'#769753':'#afbf71'}" stroke-width="2" fill="none" opacity=".55"/>`;}).join('');
  const littleFlowers=[[91,640],[126,702],[235,714],[655,660],[697,709],[565,748],[247,604]].map(([x,y],i)=>`<g transform="translate(${x} ${y})"><path d="M0 0v10" stroke="#65844c" stroke-width="2"/><g fill="${i%2?'#fff7dc':'#e3b77c'}"><circle cx="-4" r="3"/><circle cx="4" r="3"/><circle cy="-4" r="3"/><circle cy="4" r="3"/></g><circle r="2" fill="#c5a551"/></g>`).join('');
  const backdrop=storm?`<g class="garden-cloud" fill="#3d606b"><ellipse cx="135" cy="102" rx="170" ry="77"/><ellipse cx="394" cy="60" rx="180" ry="100"/><ellipse cx="675" cy="90" rx="200" ry="85"/></g><g class="rain-lines" stroke="#d7edee" stroke-width="4" stroke-linecap="round" opacity=".8">${Array.from({length:26},(_,i)=>{const x=(i%7)*126+40,y=150+Math.floor(i/7)*148;return `<path d="m${x} ${y}-18 30"/>`;}).join('')}</g>`:wind?'<g stroke="#fffdf0" opacity=".65" stroke-width="6" fill="none" stroke-linecap="round"><path d="M-30 210q130-80 260-15t350-25M555 260q120-65 280-5M-20 380q100-55 205-8"/></g><g fill="#d6b56a"><ellipse cx="110" cy="270" rx="16" ry="8" transform="rotate(-25 110 270)"/><ellipse cx="651" cy="360" rx="19" ry="8" transform="rotate(25 651 360)"/></g>':'';
  const trouble=challenge==='trouble'?'<g stroke="#906f48" stroke-width="9" stroke-linecap="round"><path d="m177 654 111 36m-65-22-5-28m16 32 22-18m301 34 111-46m-65 28 7-27m18 19 23 12"/></g><g fill="#b99953"><ellipse cx="245" cy="630" rx="13" ry="6"/><ellipse cx="608" cy="623" rx="14" ry="7"/></g>':'';
  const worm=challenge==='worm'?'<g transform="translate(487 352) rotate(-10)"><g fill="#c4dc7d" stroke="#547747" stroke-width="2"><circle cx="0" cy="0" r="12"/><circle cx="16" cy="-2" r="12"/><circle cx="31" cy="-5" r="14"/></g><circle cx="34" cy="-9" r="2" fill="#315436"/><path d="m25-17-3-7m12 5 4-7M29 0q5 4 10-1" stroke="#416a3f" stroke-width="2" fill="none"/></g>':'';
  let fx='';
  if(effect==='water')fx=`<g class="watering-can" transform="translate(0 0)"><path d="m223 464 86 30 7 28-32-10-73-13Z" fill="#91b5a7" stroke="#4a7e6b" stroke-width="3"/><path d="M153 452h86l-10 83q-36 28-69-3Z" fill="url(#can-${id})" stroke="#4a7e6b" stroke-width="3"/><path d="M160 463q-69-34-53 31 11 26 46 16" fill="none" stroke="#4a7e6b" stroke-width="13"/><ellipse cx="196" cy="452" rx="43" ry="10" fill="#c4d6ba"/><path d="M182 473v42" stroke="#dcebd0" stroke-width="7" stroke-linecap="round" opacity=".7"/></g><g class="water-stream" stroke="#8fcedb" stroke-width="5" fill="none" stroke-linecap="round"><path d="M315 505q48 42 65 130M305 516q28 50 52 119M325 510q70 30 87 125"/></g><g class="water-ripples" stroke="#97c9be" stroke-width="3" fill="none"><ellipse cx="397" cy="654" rx="75" ry="13"/><ellipse cx="397" cy="654" rx="42" ry="7"/></g>`;
  if(effect==='typhoon')fx='<g class="care-reveal" transform="translate(365 439)"><path d="M8 13q5-43 28-43t28 43l30 28-14 23-20-15v53H12V49L-8 64l-14-23Z" fill="#f4cd65" stroke="#b58c37" stroke-width="3"/><path d="M15 11q22 15 43 0M36 21v70" stroke="#bf9949" stroke-width="3" fill="none"/><circle cx="37" cy="45" r="3" fill="#fff7d5"/></g>';
  if(effect==='worm')fx='<g class="spray-mist" fill="#f4fce6"><circle cx="450" cy="350" r="20" opacity=".8"/><circle cx="475" cy="355" r="30" opacity=".6"/><circle cx="510" cy="334" r="28" opacity=".7"/><path d="m488 300 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/></g>';
  if(effect==='wind')fx=`<g class="care-reveal" transform="translate(263 520) scale(3.7)">${createAppIconMarkup('tree-support')}</g>`;
  if(effect==='trouble')fx=`<g transform="translate(210 578) scale(3.9)"><g class="broom-action">${createAppIconMarkup('tree-broom')}</g></g>`;
  return `<svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="sky-${id}" x2="0" y2="1"><stop stop-color="${storm?'#709095':wind?'#b6cec2':'#edf0d3'}"/><stop offset="1" stop-color="${storm?'#b3c8b9':'#fff1d7'}"/></linearGradient>
    <radialGradient id="sun-${id}"><stop stop-color="#fff6c4"/><stop offset=".45" stop-color="#f4db91" stop-opacity=".7"/><stop offset="1" stop-color="#f4db91" stop-opacity="0"/></radialGradient>
    ${leaf.map((colors,i)=>`<radialGradient id="leaf${i}-${id}" cx=".34" cy=".24" r=".85"><stop stop-color="${colors[0]}"/><stop offset=".55" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></radialGradient>`).join('')}
    <linearGradient id="bark-${id}"><stop stop-color="#8e6945"/><stop offset=".45" stop-color="#bc9463"/><stop offset=".7" stop-color="#c69e6c"/><stop offset="1" stop-color="#9c784d"/></linearGradient>
    <linearGradient id="river-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b2d6cc"/><stop offset=".5" stop-color="#76b6b1"/><stop offset="1" stop-color="#4c959a"/></linearGradient>
    <linearGradient id="grass-${id}" x2="0" y2="1"><stop stop-color="#b2c48a"/><stop offset="1" stop-color="#789c65"/></linearGradient>
    <radialGradient id="gold-${id}" cx=".3" cy=".3"><stop stop-color="#ffedab"/><stop offset="1" stop-color="#cfa256"/></radialGradient>
    <radialGradient id="fruit-${id}" cx=".3" cy=".3"><stop stop-color="#f2c989"/><stop offset="1" stop-color="#c9844d"/></radialGradient>
    <linearGradient id="can-${id}"><stop stop-color="#b8ceba"/><stop offset="1" stop-color="#6a9d86"/></linearGradient>
    <filter id="soft-${id}" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#355d34" flood-opacity=".17"/></filter>
  </defs>
  <rect width="800" height="800" fill="url(#sky-${id})"/>
  ${!storm?`<circle cx="623" cy="141" r="133" fill="url(#sun-${id})"/><circle cx="623" cy="141" r="40" fill="#f7e7ae" opacity=".7"/>`:''}
  <g class="garden-cloud" fill="${clouds}" opacity=".65"><path d="M67 165q-12-17 4-29 10-8 23 0 2-32 30-28 25 2 26 27 21-9 30 7 8 13-6 23Z"/><path d="M495 89q-10-12 1-24 11-10 25-3 5-28 29-23 18 3 22 24 23-4 26 13 3 10-10 13Z"/></g>
  <path d="M0 441Q109 376 256 423T515 420 800 386V800H0Z" fill="#c8d3a5"/>
  <path d="M0 496Q154 422 301 471T800 462V800H0Z" fill="#b7c697"/>
  <g fill="#93ad7c" opacity=".35"><path d="M0 464q27-47 57 0 25-66 66-8 35-44 70 20Z"/><path d="M609 452q32-51 71 0 37-68 77-10 27-44 53-3v49H600Z"/></g>
  <path d="M0 578Q170 514 350 559T800 546V800H0Z" fill="url(#grass-${id})"/>
  <path d="M617 483Q551 540 614 587T642 676Q632 733 800 767V800H800Q574 770 569 699T570 611Q515 540 590 483Z" fill="#d6dec0"/>
  <path d="M605 484Q542 544 604 591T628 679Q618 740 800 781V800Q586 762 583 699T582 612Q529 539 598 484Z" fill="url(#river-${id})"/>
  <g class="river-glint" stroke="#edf9e2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"><path d="M596 521q-23 29-5 52M605 615q30 32 9 66M653 727q38 25 93 35"/><path d="m590 588 18 8m-7 55 16 9m49 83 29 9"/></g>
  <path d="M401 663Q372 688 350 710T335 800H230Q266 721 337 686T401 663" fill="#d5cd9e" opacity=".9"/>
  <g fill="#ece5c4" stroke="#c5bc91" stroke-width="2"><ellipse cx="371" cy="694" rx="16" ry="6" transform="rotate(-15 371 694)"/><ellipse cx="341" cy="722" rx="21" ry="8" transform="rotate(-18 341 722)"/><ellipse cx="316" cy="761" rx="27" ry="10" transform="rotate(-14 316 761)"/></g>
  ${grass}${littleFlowers}${treeShape(id,stage)}${worm}${trouble}
  <g transform="translate(236 365)"><g class="tree-butterfly"><path d="M0 0q-23-31-29-6-6 25 27 13M0 0q22-27 27-5 5 24-26 12" fill="#f0d491" stroke="#d2ac66" stroke-width="2"/><path d="m0 0 1 16m-1-16-4-7m4 7 4-7" stroke="#85724a" stroke-width="2"/></g></g>
  <g opacity=".7" fill="#f4f3c5"><circle class="ambient-light" cx="193" cy="509" r="4"/><circle class="ambient-light" cx="506" cy="562" r="3" style="animation-delay:1s"/><circle class="ambient-light" cx="317" cy="547" r="3" style="animation-delay:2s"/></g>
  <g fill="#5c8358"><ellipse cx="21" cy="719" rx="28" ry="58" transform="rotate(-29 21 719)"/><ellipse cx="43" cy="752" rx="22" ry="48" transform="rotate(29 43 752)"/><ellipse cx="777" cy="681" rx="24" ry="59" transform="rotate(-26 777 681)"/><ellipse cx="799" cy="729" rx="32" ry="65" transform="rotate(14 799 729)"/></g>
  <g stroke="#acc18c" stroke-width="3" fill="none"><path d="M0 780q22-40 23-82m10 70 14-51m734 25-8-81"/></g>
  ${backdrop}${state.waterDates.size&&!mini?'<g class="watered-glow" fill="#fff4ba"><path d="m476 204 5 14 14 5-14 5-5 14-5-14-14-5 14-5Z"/><path d="m279 398 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/></g>':''}${fx}
  </svg>`;
}
function createAppIconMarkup(key){return createAppIcon(key).querySelector('svg').innerHTML;}
function todayDone(){return state.waterDates.has('today');}
function targetDate(){if(state.pendingDate&&!state.waterDates.has(state.pendingDate))return state.pendingDate;if(state.readDates.has('today')&&!todayDone())return 'today';return [...state.readDates].find(date=>!state.waterDates.has(date))||'';}
function render(){
  const target=targetDate(),done=todayDone(),stage=state.waterDates.size?3:2;
  $('#garden-art').innerHTML=illustration({stage,challenge:state.challenge,effect:state.effect});
  $('#garden-scene').dataset.weather=state.challenge||'clear';
  $('#garden-art').setAttribute('aria-label',state.challenge?`生命樹庭園：${specs[state.challenge].condition}`:`溪流與草坡上的${stage===3?'開花':'小樹'}生命樹`);
  $('#world-condition').textContent=state.challenge?specs[state.challenge].condition:state.waterDates.size?'活水澆灌，小花悄悄開了':'微風，適合慢慢生長';
  $('#garden-mood').textContent=state.challenge?'小樹旁有道具，點一下陪它度過。':state.waterDates.size?'✦ 謝謝你，今天也一起長大了。':'✦ 小樹在等今天的活水';
  $('#growth-button>span:nth-child(2)').innerHTML=`${stage===3?'開花期':'小樹期'}<small>看看成長</small>`;
  const read=state.readDates.has('today');
  $('#step-read').classList.toggle('done',read);$('#step-water').classList.toggle('done',done);
  ['read','water','devotional'].forEach(step=>$('#step-'+step).removeAttribute('aria-current'));
  $('#step-'+(done?'devotional':read?'water':'read')).setAttribute('aria-current','step');
  $('#task-title').textContent=target?'讀完了，送小樹一點活水。':done?'今天的養分，小樹收到了。':'讓神的話，成為養分。';
  $('#task-description').textContent=target?target==='today'?'按下澆水，看它舒展嫩葉。':`為 ${target} 的補讀澆水，找回那一天的養分。`:done?'帶著這份安靜，繼續與神相遇。':'讀一段經文，再回來為小樹澆水。';
  const button=$('#primary-action');button.disabled=state.busy;button.replaceChildren(createAppIcon(target?'sprout':done?'heart':'book','action-icon'));
  $(target?'#world-action-slot':'#today-action-slot').append(button);
  const label=document.createElement('span');label.append(document.createTextNode(state.effect==='water'?'活水澆灌中…':target?'為小樹澆水':done?'體驗每日靈修 / 與神相遇':'打開今日讀經'));
  const small=document.createElement('small');small.textContent=target?(target==='today'?'今日讀經已完成':`${target} · 補讀示範`):done?'留一點時間，安靜與神相遇':'箴言 3:5–6 · 閱讀示範';label.append(small);button.append(label);const arrow=document.createElement('span');arrow.textContent='→';arrow.setAttribute('aria-hidden','true');button.append(arrow);
  const count=Math.min(7,6+state.waterDates.size);$('#growth-count').textContent=`${count} / 7 天`;$('.growth-meter').setAttribute('aria-valuenow',String(count));$('#growth-fill').style.width=`${count/7*100}%`;$('#growth-hint').textContent=count===7?'第一朵小花開了，收藏今天的成長。':'再一次澆水，迎接第一朵小花。';$('#flower-milestone').classList.toggle('reached',count===7);
  $('#stars-count').textContent=`已收藏 ${state.stars} 枚`;
  const tools=$('#care-tools');tools.replaceChildren();tools.hidden=!state.challenge;
  $('#challenge-hint').hidden=!state.challenge;
  if(state.challenge){const spec=specs[state.challenge];const tool=document.createElement('button');tool.type='button';tool.className='care-tool';tool.id='care-tool';tool.disabled=state.busy;tool.append(createAppIcon(spec.icon,'tool-icon'));const text=document.createElement('span');text.textContent=state.busy?'照顧中…':spec.label;tool.append(text);tool.onclick=resolveChallenge;tools.append(tool);$('#challenge-icon').replaceChildren(createAppIcon(spec.icon,'tool-icon'));$('#challenge-title').textContent=spec.title;$('#challenge-description').textContent=spec.description;}
  document.querySelectorAll('[data-challenge]').forEach(button=>{button.disabled=state.busy;button.setAttribute('aria-pressed',String(state.challenge===button.dataset.challenge));});
  $('#reset-button').disabled=false;
}
function feedback(message,duration=3000){clearTimeout(feedbackTimer);const node=$('#world-feedback');node.textContent=message;node.hidden=false;feedbackTimer=setTimeout(()=>{node.hidden=true;},duration);}
function scrollToTree(){const node=$('.garden-world');node.scrollIntoView({block:'start',behavior:reducedMotion()?'instant':'smooth'});$('#touch-tree').focus({preventScroll:true});}
function openDialog(kicker,content){lastFocus=document.activeElement;$('#dialog-kicker').textContent=kicker;$('#dialog-content').innerHTML=content;icons($('#dialog-content'));dialog.showModal();dialog.scrollTop=0;document.body.classList.add('dialog-open');$('#close-dialog').focus({preventScroll:true});$('#devotional-invite').hidden=true;void updateMusic();}
function closeDialog(){dialog.close();}
dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});void updateMusic();});
$('#close-dialog').onclick=closeDialog;
function openReading(date='today'){
  const isMakeup=date!=='today';
  openDialog(isMakeup?`${date} · 補讀示範`:'今日讀經 · 閱讀示範',`<h2 id="dialog-title">專心仰賴，讓心扎根。</h2><p>箴言 3:5–6</p><div class="scripture-sample">你要專心仰賴耶和華，<br>不可倚靠自己的聰明，<br>在你一切所行的事上都要認定他，<br>他必指引你的路。</div><p>把今天的腳步交在神手中。讀完後，回庭園送小樹一點活水。</p><button type="button" id="finish-reading" class="dialog-action">讀完了，回小樹澆水 →</button><p class="dialog-note">這是節錄經文的互動示範，不會記錄正式讀經進度。</p>`);
  $('#finish-reading').onclick=()=>{if(state.busy)return;state.readDates.add(date);state.pendingDate=state.waterDates.has(date)?'':date;closeDialog();render();$('#action-status').textContent=state.waterDates.has(date)?'這一天已經完成澆水。':'經文讀完了，現在可以為小樹澆水。';scrollToTree();void playEffect('open');};
}
function water(){
  const date=targetDate();if(!date||state.busy||!state.readDates.has(date))return;
  state.busy=true;state.effect='water';render();scrollToTree();feedback('活水流進土裡，小樹正在吸收養分。',5000);void playEffect('water');
  animationTimer=setTimeout(()=>{state.waterDates.add(date);state.pendingDate='';state.busy=false;state.effect='';render();feedback('第一朵小花，為今天的陪伴綻放。',4000);$('#action-status').textContent=date==='today'?'今日讀經與澆水示範已完成。':`${date} 的補讀與澆水示範已完成。`;void playEffect('celebration');if(date==='today'&&!dialog.open)$('#devotional-invite').hidden=false;$('#primary-action').focus({preventScroll:true});},reducedMotion()?400:2800);
}
$('#primary-action').onclick=()=>{if(state.busy)return;targetDate()?water():todayDone()?openDevotional():openReading();};
function resolveChallenge(){
  if(!state.challenge||state.busy)return;const type=state.challenge;state.busy=true;state.effect=type;render();feedback(type==='wind'?'搭著肩，一起站穩。':'小樹收到你的照顧了。',4500);void playEffect(type==='wind'?'wind':'water');
  animationTimer=setTimeout(()=>{state.challenge='';state.effect='';state.busy=false;state.stars++;render();feedback(specs[type].success+' ＋1 守護星光',4500);void updateMusic();$('#touch-tree').focus({preventScroll:true});},reducedMotion()?400:2600);
}
document.querySelectorAll('[data-challenge]').forEach(button=>button.onclick=()=>{if(state.busy)return;state.challenge=button.dataset.challenge;state.effect='';render();scrollToTree();feedback(specs[state.challenge].description,4000);void updateMusic();});
$('#touch-tree').onclick=()=>{if(state.busy)return;const node=$('#garden-scene');node.classList.remove('tree-patted');void node.offsetWidth;node.classList.add('tree-patted');feedback(state.challenge?'有你陪著，小樹就不孤單。':'小樹輕輕搖了搖葉子，向你打招呼。');void playEffect('open');};
function openDevotional(){
  openDialog('每日靈修 · 體驗示範',`<h2 id="dialog-title">與神相遇</h2><p>今天，先把心慢慢安靜下來。</p><div class="scripture-sample">在你一切所行的事上都要認定他，<br>他必指引你的路。</div><h3>帶著一句話默想</h3><p>今天有哪一件事，你願意交給神帶領？不必急著找出答案，先把心裡真實的感受告訴祂。</p><h3>用禱告回應</h3><p>主啊，求祢指引今天的腳步。在我還不明白的時候，讓我學習仰賴祢。阿們。</p><label for="preview-journal">拾光手札 · 今天的亮光</label><textarea id="preview-journal" maxlength="500" placeholder="留下一句話，記住今天與神相遇的時刻。"></textarea><p class="journal-retained" id="journal-status" role="status">手札只保留在這次預覽中，重新整理後清空。</p><button type="button" class="dialog-action" id="return-garden">帶著亮光，回到庭園 →</button><p class="dialog-note">此為互動示範，正式一、二月靈修內容及審核狀態維持原樣。</p>`);
  $('#preview-journal').value=state.journal;$('#preview-journal').oninput=event=>{state.journal=event.target.value;$('#journal-status').textContent='已保留在這次預覽中；尚未寫入正式手札。';};
  $('#return-garden').onclick=()=>{closeDialog();$('#step-devotional').classList.add('done');feedback(state.journal?'這一刻的亮光，留在心裡。':'帶著平安，繼續今天的生活。');scrollToTree();void playEffect('journal');};
}
$('#open-devotional').onclick=openDevotional;$('#dismiss-invite').onclick=()=>{$('#devotional-invite').hidden=true;$('#primary-action').focus({preventScroll:true});};
$('#makeup-button').onclick=()=>{openDialog('找回養分 · 補讀示範',`<h2 id="dialog-title">選一天，慢慢補回來。</h2><p>還有兩天的養分，可以陪小樹找回來。</p><div class="preview-calendar"><button type="button" data-makeup="10/9">10/9<small>可補讀</small></button><button type="button" data-makeup="10/8">10/8<small>可補讀</small></button><button type="button" disabled>10/7<small>已完成</small></button><select aria-label="其他補讀日期" disabled><option>其他日期</option></select></div><p class="dialog-note">此處只有兩個示範日期；正式補讀仍依最近七天及既有規則。</p>`);document.querySelectorAll('[data-makeup]').forEach(button=>{if(state.waterDates.has(button.dataset.makeup)){button.disabled=true;button.querySelector('small').textContent='已澆水';}button.onclick=()=>{const date=button.dataset.makeup;closeDialog();openReading(date);};});};
$('#companions-button').onclick=()=>{openDialog('同行花園 · 示意',`<h2 id="dialog-title">一起生長，各有節奏。</h2><p>在同一座庭園，看看彼此的小樹。</p><div class="mini-garden">${['同行小樹 A','同行小樹 B','同行小樹 C'].map((name,i)=>`<div class="mini-tree">${illustration({id:'friend'+i,stage:i+1,mini:true})}<strong>${name}</strong></div>`).join('')}</div><p class="dialog-note">此處為示意小樹，尚未接入同工或會友資料；共同庭園是下一階段項目。</p>`);};
$('#collection-button').onclick=()=>{openDialog('守護星光 · 示範收藏',`<h2 id="dialog-title">每一次照顧，都有光。</h2><p>你已收藏 ${state.stars} 枚守護星光。</p><div class="star-shelf" aria-label="${state.stars} 枚守護星光">${Array.from({length:state.stars},()=>'<span aria-hidden="true">✦</span>').join('')}</div><p>完成一項風雨照顧，收下一枚守護星光。</p><p class="dialog-note">收藏數量僅供這次預覽，不影響正式挑戰紀錄。</p>`);};
$('#growth-button').onclick=()=>{openDialog('生命樹的成長旅程 · 示意',`<h2 id="dialog-title">一點點養分，長成風景。</h2><div class="growth-stages">${['幼苗','小樹','開花','結果','成蔭'].map((label,i)=>`<div>${illustration({id:'growth'+i,stage:i+1,mini:true})}<strong>${label}</strong></div>`).join('')}</div><p>先從每一天的讀經與澆水開始，累積屬於自己的生長。</p><p class="dialog-note">此處展示造型方向，正式成長條件及進度尚未調整。</p>`);};
$('#help-button').onclick=()=>{openDialog('使用說明',`<h2 id="dialog-title">讀一點，澆點水，與神一起成長。</h2><div class="guide-cards"><div><span data-icon="book"></span><span><strong>讀經，給心一點養分</strong><p>打開今日讀經，讀完回到小樹。</p></span></div><div><span data-icon="sprout"></span><span><strong>澆水，看小樹回應你</strong><p>按下澆水，看看葉片與小花的變化。</p></span></div><div><span data-icon="heart"></span><span><strong>靈修，繼續與神相遇</strong><p>澆水後，點開浮出的每日靈修。</p></span></div></div><label class="guide-audio"><input id="guide-sound" type="checkbox" checked>開啟音樂與音效</label><button type="button" class="dialog-action" id="start-garden">開始照顧小樹 →</button><p class="dialog-note">預覽可反覆試玩，不會變更正式資料。</p>`);$('#start-garden').onclick=()=>{const enabled=$('#guide-sound').checked;closeDialog();setSound(enabled);};};
function reset(){clearTimeout(animationTimer);clearTimeout(feedbackTimer);state.readDates.clear();state.waterDates.clear();state.pendingDate='';state.challenge='';state.effect='';state.busy=false;state.stars=3;state.journal='';$('#devotional-invite').hidden=true;$('#world-feedback').hidden=true;$('#action-status').textContent='';$('#step-devotional').classList.remove('done');render();scrollToTree();void updateMusic();}
$('#reset-button').onclick=reset;
function media(kind){const audio=new Audio();audio.preload='none';audio.dataset.gardenPreviewAudio=kind;return audio;}
async function safePlay(audio){let timer;try{await Promise.race([audio.play(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('audio_timeout')),6000);})]);}finally{clearTimeout(timer);}}
function audioURL(track){return new URL(`./assets/audio/life-tree/${track}.wav`,import.meta.url).href;}
function soundButton(){const playing=Boolean(state.sound&&music&&!music.paused&&!music.error);$('#sound-button').setAttribute('aria-pressed',String(playing));$('#sound-button').setAttribute('aria-label',playing?'關閉音樂與音效':state.sound?'重新啟用音樂與音效':'開啟音樂與音效');}
async function updateMusic(){
  if(!state.sound)return;music ||=media('music');music.loop=true;music.volume=.28;const track=dialog.open?'reading':state.challenge==='typhoon'||state.challenge==='wind'?'storm':state.challenge?'care':'reading';const url=audioURL(track);if(music.src===url&&!music.paused){soundButton();return;}const version=++audioVersion;music.pause();music.src=url;
  try{await safePlay(music);if(version!==audioVersion||!state.sound||document.hidden){if(version===audioVersion)music.pause();return;}$('#audio-status').textContent='';}catch{if(version===audioVersion){music.pause();$('#audio-status').textContent='音樂尚未播放，請點喇叭重試。';}}finally{soundButton();}
}
function setSound(enabled){state.sound=enabled;if(enabled){void updateMusic();}else{++audioVersion;music?.pause();effectAudio?.pause();$('#audio-status').textContent='';soundButton();}}
async function playEffect(track){if(!state.sound)return;effectAudio ||=media('effect');effectAudio.pause();effectAudio.src=audioURL(track);effectAudio.volume=.5;try{await safePlay(effectAudio);}catch{if(state.sound)$('#audio-status').textContent='音效尚未播放，請點喇叭重試。';}}
$('#sound-button').onclick=()=>setSound(!state.sound||Boolean(music?.paused));
document.addEventListener('visibilitychange',()=>{if(document.hidden){++audioVersion;music?.pause();effectAudio?.pause();soundButton();}else if(state.sound)$('#audio-status').textContent='音效設定保留，輕觸頁面即可繼續播放。';});
document.addEventListener('click',event=>{if(state.sound&&music?.paused&&!event.target.closest('#sound-button'))void updateMusic();});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&state.sound&&music?.paused)void updateMusic();});
icons();render();
