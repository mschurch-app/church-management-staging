import {festivalScene} from './life-tree-festival-art.mjs?v=20261011-spring-joy1';
import {createAppIcon} from './app-icons.mjs?v=20261010-playful-care1';

// Presentation only: all progress, care and journal records come from the existing API.
function flowers(points,id){return points.map(([x,y],i)=>`<g transform="translate(${x} ${y})"><g class="flower-reveal" style="animation-delay:${i*.09}s"><g fill="#fff9d9" stroke="#f0d5b1" stroke-width="1"><ellipse cy="-7" rx="5" ry="7"/><ellipse cx="7" rx="7" ry="5"/><ellipse cy="7" rx="5" ry="7"/><ellipse cx="-7" rx="7" ry="5"/></g><circle r="4" fill="url(#gold-${id})"/></g></g>`).join('');}
function treeShape(id,stage=2){
  if(stage===1)return `<g><ellipse cx="400" cy="660" rx="91" ry="20" fill="#6c8b4c" opacity=".18"/><path d="M398 649Q412 584 395 527" fill="none" stroke="#6f9151" stroke-width="12" stroke-linecap="round"/><g class="tree-crown tree-canopy"><path d="M398 566Q291 578 304 485Q391 475 398 566" fill="url(#leaf0-${id})"/><path d="M401 551Q505 554 489 458Q403 465 401 551" fill="url(#leaf1-${id})"/><path d="m397 564-68-58m73 43 64-65" stroke="#d5e6ac" stroke-width="4" stroke-linecap="round" fill="none"/></g><path d="M365 660q-16-23-31-7 9 18 31 7" fill="#80a15d"/></g>`;
  const mature=stage>=2,scale=stage===1?.48:stage===2?.84:stage===5?1.12:stage===4?1.04:1;
  const leaves=[[-78,1,64],[-113,-62,65],[97,-24,68],[114,-81,63],[-66,-117,72],[55,-134,73],[3,-70,90],[-34,-35,70],[52,-28,72],[-22,-151,64]];
  return `<g transform="translate(400 650) scale(${scale}) translate(-400 -650)"><ellipse cx="405" cy="656" rx="132" ry="27" fill="#466f3b" opacity=".16"/>
    <path d="M375 654Q393 596 388 499L383 368Q398 355 408 372L411 497Q409 590 432 654Z" fill="url(#bark-${id})" stroke="#8c603d" stroke-width="2"/>
    <path d="M397 638Q399 520 396 421M400 513q-55-25-86-71M405 484q54-16 85-65" fill="none" stroke="#e3b478" stroke-width="5" opacity=".6" stroke-linecap="round"/>
    <path d="M395 502Q356 478 322 428M405 476Q450 456 486 418" fill="none" stroke="#9d7248" stroke-width="14" stroke-linecap="round"/>
    <g class="tree-crown tree-canopy" filter="url(#soft-${id})">${leaves.map(([x,y,r],i)=>`<g><circle cx="${400+x}" cy="${391+y}" r="${r}" fill="url(#leaf${i%3}-${id})"/><ellipse cx="${386+x}" cy="${371+y}" rx="${r*.33}" ry="${r*.18}" fill="#edfac2" opacity=".27" transform="rotate(-25 ${386+x} ${371+y})"/><path d="M${390+x} ${403+y}q15 8 28-1" fill="none" stroke="#456d3d" stroke-width="2" opacity=".13"/></g>`).join('')}
    ${stage>=3?flowers([[342,300],[472,337],[392,405],[309,369],[446,245],[365,238]],id):''}
    ${stage>=4?[[340,375],[470,385],[425,280],[380,340]].map(([x,y])=>`<g transform="translate(${x} ${y})"><path d="M0-10q5-8 12-5" stroke="#416335" stroke-width="4" fill="none"/><circle r="14" fill="url(#fruit-${id})"/><ellipse cx="-5" cy="-5" rx="4" ry="6" fill="#fff9dc" opacity=".7"/></g>`).join(''):''}
    ${mature?'<path d="M379 445q7 6 15 0m19-3q7 6 14-1" stroke="#365638" opacity=".32" fill="none" stroke-width="3" stroke-linecap="round"/>':''}</g>
    <path d="M342 657q-14-30-34-11 4 24 34 11M457 654q17-28 32-7-7 18-32 7" fill="#68954e"/><path d="m324 651 21 7m129-9-18 7" stroke="#c6dd92" stroke-width="2"/>
  </g>`;
}
export function gardenIllustration({id='main',stage=2,challenge='',effect='',mini=false,watered=false,weather='partly-cloudy',dry=false,festival=null}={}){
  const storm=challenge==='typhoon',wind=challenge==='wind';
  const clouds=storm?'#68858a':'#fffcdf';
  const leaf=dry?[["#e2d7a0","#b6ae72","#827c4d"],["#d7cc91","#a49b62","#797346"],["#eee3b5","#bfb17b","#8f8458"]]:[["#d4e7a0","#91b267","#527d4e"],["#c7e092","#83aa5c","#426e47"],["#e3ecaf","#a5bc6b","#668b4e"]];
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
  const svg=`<svg data-care-scene="${challenge||'none'}" data-stage="${stage}" viewBox="0 0 800 800" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs>
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
  ${grass}${littleFlowers}${treeShape(id,stage)}<g class="care-scene-fx">${worm}${trouble}</g>
  <g transform="translate(236 365)"><g class="tree-butterfly"><path d="M0 0q-23-31-29-6-6 25 27 13M0 0q22-27 27-5 5 24-26 12" fill="#f0d491" stroke="#d2ac66" stroke-width="2"/><path d="m0 0 1 16m-1-16-4-7m4 7 4-7" stroke="#85724a" stroke-width="2"/></g></g>
  <g opacity=".7" fill="#f4f3c5"><circle class="ambient-light" cx="193" cy="509" r="4"/><circle class="ambient-light" cx="506" cy="562" r="3" style="animation-delay:1s"/><circle class="ambient-light" cx="317" cy="547" r="3" style="animation-delay:2s"/></g>
  <g fill="#5c8358"><ellipse cx="21" cy="719" rx="28" ry="58" transform="rotate(-29 21 719)"/><ellipse cx="43" cy="752" rx="22" ry="48" transform="rotate(29 43 752)"/><ellipse cx="777" cy="681" rx="24" ry="59" transform="rotate(-26 777 681)"/><ellipse cx="799" cy="729" rx="32" ry="65" transform="rotate(14 799 729)"/></g>
  <g stroke="#acc18c" stroke-width="3" fill="none"><path d="M0 780q22-40 23-82m10 70 14-51m734 25-8-81"/></g>
  ${challenge==='worm'?'<g class="care-scene-fx" fill="#ddbe69" opacity=".22"><rect width="800" height="800"/><circle cx="343" cy="284" r="13"/><circle cx="480" cy="325" r="10"/><circle cx="399" cy="377" r="12"/></g>':''}${backdrop}${!challenge&&['rain','cold-rain','storm'].includes(weather)?'<g class="live-weather-fx rain-lines" stroke="#89b4bb" stroke-width="4" opacity=".65"><path d="m90 150-12 23m55-23-12 23m55-23-12 23m55-23-12 23"/></g>':''}${watered&&!mini?'<g class="watered-glow" fill="#fff4ba"><path d="m476 204 5 14 14 5-14 5-5 14-5-14-14-5 14-5Z"/><path d="m279 398 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/></g>':''}${fx}
  </svg>`;
  if(!festival?.item)return svg;
  const transform='translate(500 650) scale(1.1) translate(-400 -650)';
  const extraDefs=svg.slice(svg.indexOf('<defs>')+6,svg.indexOf('</defs>'));
  const careMarkup=`<g class="care-scene-fx">${storm?'<rect width="1000" height="850" fill="#23374d" opacity=".3"/>':''}<g transform="${transform}">${worm}${trouble}${backdrop}${!challenge&&['rain','cold-rain','storm'].includes(weather)?'<g class="live-weather-fx rain-lines" stroke="#89b4bb" stroke-width="4" opacity=".65"><path d="m90 150-12 23m55-23-12 23m55-23-12 23m55-23-12 23"/></g>':''}${fx}${watered?'<g class="watered-glow" fill="#fff4ba"><path d="m476 204 5 14 14 5-14 5-5 14-5-14-14-5 14-5Z"/></g>':''}</g></g>`;
  return festivalScene(festival.item,{day:festival.day,progress:festival.progress??(watered?7:3),hits:festival.hits||0,phase:festival.phase||(effect==='water'?'watering':effect?'acting':'idle'),extraDefs,treeMarkup:`<g transform="translate(500 650) scale(${stage===1?1.45:1.1}) translate(-400 -650)">${treeShape(id,stage)}</g>`,treeStage:stage,careMarkup})
    .replace('<svg class="festival-illustration"',`<svg data-care-scene="${challenge||'none'}" data-stage="${stage}" class="festival-illustration"`)
    .replace('viewBox="0 0 1000 850"','viewBox="0 0 1000 850" preserveAspectRatio="xMidYMid meet"')
    .replace('role="img"','aria-hidden="true" focusable="false"');
}
function createAppIconMarkup(key){return createAppIcon(key).querySelector('svg').innerHTML;}

export function growthStage(stats,growthMultiplier=12){
  const days=Math.max(0,Number(stats.onTime)||0)+Math.max(0,Number(stats.late)||0);
  const week=Math.max(1,Math.ceil(Math.max(0,days*Math.max(1,Number(growthMultiplier)||1)-(stats.missedStreak>=3?1:0))/7));
  return week<=3?1:week<=13?2:week<=26?3:week<=39?4:5;
}
export function renderLifeTree(person,stats,date,gardenMode=false,weather='partly-cloudy',growthMultiplier=12,festival=null){
  const types=new Set((stats.personalEvents||[]).map(event=>event.type));
  const challenge=['typhoon','wind','worm','trouble'].find(type=>types.has(type))||'';
  const id='garden-'+String(person.id).replace(/[^a-zA-Z0-9_-]/g,'');
  let svg=gardenIllustration({id,stage:growthStage(stats,growthMultiplier),challenge,mini:gardenMode,weather,dry:Boolean(stats.missedStreak),watered:Boolean(stats.watered),effect:stats.effect||'',festival});
  // The accessible container announces the real member and status; scene SVG is decorative.
  if(gardenMode)svg=svg.replace('viewBox="0 0 800 800"','viewBox="165 170 470 530"');
  return svg;
}
