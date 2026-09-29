const seasonFor = (date) => { const month = Number(date.slice(5, 7)); return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter'; };
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function weatherOverlay(mood) {
  if (mood === 'rain' || mood === 'cold-rain' || mood === 'storm') { const storm = mood === 'storm'; return `<g class="live-weather-fx ${storm ? 'storm-weather' : 'rain-weather'}" aria-hidden="true"><path d="M102 158a29 29 0 0 1 55-8 22 22 0 0 1 30 20H98a16 16 0 0 1 4-12" fill="#fff" opacity=".92"/><path d="m114 180-7 20m29-20-7 20m29-20-7 20" stroke="${storm ? '#91a4b8' : '#68b7d1'}" stroke-width="5" stroke-linecap="round"/></g>${storm ? '<path class="weather-lightning" d="m188 188-12 19h10l-5 15 17-22h-11l5-12Z" fill="#f9d566"/>' : ''}`; }
  if (mood === 'windy') return '<g class="live-weather-fx wind-weather" fill="none" stroke="#74b3ad" stroke-width="5" stroke-linecap="round" opacity=".8"><path d="M76 242q57-28 98-2t73-3"/><path d="M91 270q43-20 75-1t55-2"/></g>';
  if (mood === 'cloudy') return '<g class="live-weather-fx" fill="#fff" opacity=".86"><path d="M103 164a24 24 0 0 1 46-8 18 18 0 0 1 25 17h-66a14 14 0 0 1-5-9"/></g>';
  return '<g class="live-weather-fx weather-breeze" fill="#fff6c7" opacity=".72"><circle cx="148" cy="166" r="24"/><path d="M78 218q57-23 98-2t73-2" fill="none" stroke="#95ceb1" stroke-width="4" stroke-linecap="round"/></g>';
}
export function renderLifeTree(person, stats, date, gardenMode = false, weather = 'partly-cloudy') {
  // 保留先前「生命樹繪本花園」的 Q 版棉花糖樹冠、溪流與草坡造型。
  const progressDays = stats.onTime + stats.late;
  const displayProgressDays = Math.max(0, progressDays - (stats.missedStreak >= 3 ? 1 : 0));
  const week = Math.max(1, Math.ceil(displayProgressDays / 7));
  const stage = week <= 3 ? 1 : week <= 13 ? 2 : week <= 26 ? 3 : week <= 39 ? 4 : 5;
  const season = seasonFor(date);
  const activeTypes = new Set(stats.personalEvents.map((event) => event.type));
  const damage = stats.personalEvents.reduce((sum, event) => sum + event.impact, 0);
  const hardshipPresent = stats.personalEvents.some((event) => !event.blessing);
  const leafOpacity = Math.min(hardshipPresent ? Math.max(.56, .96 - damage / 180) : 1, stats.missedStreak >= 2 ? .78 : stats.missedStreak === 1 ? .9 : 1);
  const leafStart = stats.missedStreak >= 2 ? (stats.missedStreak >= 4 ? 4 : stats.missedStreak - 1) : 0;
  const baseX = 380, baseY = 625;
  let trunk = '', branches = '', leaves = '', blossoms = '', fruits = '';

  if (week <= 3) {
    const sproutH = baseY - week * 22;
    trunk = `<path d="M${baseX} ${baseY}Q${baseX - 6} ${(baseY + sproutH) / 2} ${baseX} ${sproutH}" stroke="url(#sprout-${person.id})" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="${baseX + 3}" cy="${sproutH + 10}" r="4" fill="#fff"/>`;
    const r = week * 9;
    const sproutColors = stats.missedStreak ? ['#e6cf69', '#f0d979'] : ['#84cc16', '#a3e635'];
    leaves = `<ellipse cx="${baseX - r * .75}" cy="${sproutH - 5}" rx="${r}" ry="${r * .75}" fill="${sproutColors[0]}" opacity="${leafOpacity}" transform="rotate(-25 ${baseX - r * .75} ${sproutH - 5})"/><ellipse cx="${baseX + r * .75}" cy="${sproutH - 5}" rx="${r}" ry="${r * .75}" fill="${sproutColors[1]}" opacity="${leafOpacity}" transform="rotate(25 ${baseX + r * .75} ${sproutH - 5})"/>`;
  } else if (week <= 13) {
    const top = baseY - (60 + week * 14), width = 8 + week * 1.3, flare = width * 1.5;
    trunk = `<path d="M${baseX - flare / 2} ${baseY}Q${baseX - width / 2} ${baseY - 12} ${baseX - width * .35} ${top}Q${baseX} ${top - 5} ${baseX + width * .35} ${top}Q${baseX + width / 2} ${baseY - 12} ${baseX + flare / 2} ${baseY}Z" fill="url(#trunk-${person.id})"/>`;
    const count = Math.min(9, 3 + Math.floor(week * .6));
    leaves = Array.from({ length: count }, (_, index) => {
      const angle = index * 50 - 90, dist = 16 + index * 4.5;
      const x = baseX + Math.cos(angle * Math.PI / 180) * dist, y = top + Math.sin(angle * Math.PI / 180) * dist * .65, r = 16 + (index % 3) * 4;
      return `<g opacity="${leafOpacity}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="url(#leaf-${person.id})" filter="url(#leaf-shadow)"/><ellipse cx="${(x - r * .25).toFixed(1)}" cy="${(y - r * .3).toFixed(1)}" rx="${r * .4}" ry="${r * .22}" fill="url(#leaf-shine-${person.id})"/></g>`;
    }).join('');
  } else {
    const top = Math.max(340, 480 - week * 2.8), mid = Math.min(54, 18 + week * .7), twig = Math.min(32, 10 + week * .42), skirt = mid * 1.6;
    trunk = `<path d="M${baseX - skirt / 2} ${baseY + 4}Q${baseX - mid / 2} ${baseY - 20} ${baseX - mid * .4} 480C${baseX - twig * .5} 430 ${baseX - twig * .5} 380 ${baseX - twig / 2} ${top}Q${baseX} ${top - 7} ${baseX + twig / 2} ${top}C${baseX + twig * .5} 380 ${baseX + twig * .5} 430 ${baseX + mid * .4} 480Q${baseX + mid / 2} ${baseY - 20} ${baseX + skirt / 2} ${baseY + 4}Z" fill="url(#trunk-${person.id})" filter="url(#trunk-shadow)"/>`;
    const spread = Math.min(180, 24 + (week - 8) * 3.8), by = Math.max(330, 510 - week * 2.8), thick = Math.min(15, 3.5 + week * .22);
    branches = `<path d="M${baseX - 4} ${by + 30}Q${baseX - 70} ${by} ${baseX - spread} ${by - 15}" stroke="#9a5a3a" stroke-width="${thick}" stroke-linecap="round" fill="none"/><path d="M${baseX + 4} ${by + 20}Q${baseX + 70} ${by - 10} ${baseX + spread} ${by - 25}" stroke="#8a4d30" stroke-width="${thick * .9}" stroke-linecap="round" fill="none"/>`;
    if (week >= 18) branches += `<path d="M${baseX - 3} ${by - 10}Q${baseX - 45} ${by - 65} ${baseX - 75} ${by - 105}" stroke="#b66f4d" stroke-width="${thick * .55}" stroke-linecap="round" fill="none"/><path d="M${baseX + 3} ${by - 15}Q${baseX + 45} ${by - 75} ${baseX + 70} ${by - 110}" stroke="#9a5a3a" stroke-width="${thick * .55}" stroke-linecap="round" fill="none"/>`;
    const centerY = Math.max(275, 410 - week * 2.3), rx = Math.min(240, 55 + week * 3.6), ry = Math.min(180, 45 + week * 2.7);
    const clusters = [{x:0,y:-.65,r:.58},{x:-.48,y:-.32,r:.54},{x:.48,y:-.32,r:.54},{x:-.72,y:.05,r:.48},{x:.72,y:.05,r:.48},{x:-.32,y:.26,r:.52},{x:.32,y:.26,r:.52},{x:0,y:.08,r:.64},{x:-.22,y:-.42,r:.48},{x:.22,y:-.42,r:.48}];
    leaves = clusters.map((cluster, index) => {
      if (index < leafStart) return '';
      const x = baseX + cluster.x * rx, y = centerY + cluster.y * ry, r = cluster.r * Math.min(rx, ry) * (activeTypes.size && index % 5 === 0 ? .82 : 1);
      return `<g opacity="${leafOpacity}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#leaf-${person.id})" filter="url(#leaf-shadow)"/><ellipse cx="${(x-r*.28).toFixed(1)}" cy="${(y-r*.35).toFixed(1)}" rx="${(r*.42).toFixed(1)}" ry="${(r*.25).toFixed(1)}" fill="url(#leaf-shine-${person.id})"/></g>`;
    }).join('');
    if (week >= 27 || stats.blessingCount) blossoms = Array.from({ length: Math.min(20, Math.max(0, (week - 26) * 2) + stats.blessingCount * 2) }, (_, i) => {
      const angle = i * 137.5 * Math.PI / 180, dist = 35 + Math.sqrt(i) * 26, x = baseX + Math.cos(angle) * dist * (week > 40 ? 1.25 : 1), y = 300 + Math.sin(angle) * dist * .7;
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" opacity=".95"><circle cx="-4" r="3.6" fill="white"/><circle cx="4" r="3.6" fill="white"/><circle cy="-4" r="3.6" fill="white"/><circle cy="4" r="3.6" fill="white"/><circle r="3" fill="#fbbf24"/></g>`;
    }).join('');
    if (week >= 34) fruits = Array.from({ length: Math.min(12, Math.floor((week - 33) * .65) + 1) }, (_, i) => {
      const angle = i * 2.399, dist = 55 + (i % 4) * 38, x = baseX + Math.cos(angle) * dist, y = 290 + Math.sin(angle) * dist * .68, r = Math.min(12, 6 + (week - 33) * .32);
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${r * 1.7}" fill="#fef08a" opacity=".28"/><circle r="${r}" fill="url(#fruit-${person.id})" filter="url(#fruit-shadow)"/><path d="M0 ${-r}q2 -7 5 -8" stroke="#78350f" stroke-width="2" stroke-linecap="round"/><ellipse cx="5" cy="${-r - 6}" rx="3" ry="2" fill="#84cc16"/><circle cx="${-r * .3}" cy="${-r * .3}" r="${r * .27}" fill="white" opacity=".9"/></g>`;
    }).join('');
  }
  const bird = week >= 21 ? `<g transform="translate(${baseX + (week > 35 ? 120 : 70)} ${((week <= 26 ? 415 : 350) - 20)})" filter="url(#bird-shadow)"><circle r="11" fill="white"/><circle cx="8" cy="-5" r="7" fill="white"/><path d="m14 -5 5 1-5 2" fill="#f59e0b"/><circle cx="10" cy="-6" r="1.5" fill="#1e293b"/><ellipse cx="-2" cy="1" rx="6" ry="4" fill="#e2e8f0"/></g>` : '';
  const storm = activeTypes.has('typhoon') ? '<g class="weather-fx" fill="#aabdbb" opacity=".7"><path d="M100 155a27 27 0 0 1 52-8 21 21 0 0 1 29 20h-77a16 16 0 0 1-4-12"/><path d="m119 177-7 20m30-20-7 20m30-20-7 20" stroke="#69aec1" stroke-width="5" stroke-linecap="round"/></g>' : activeTypes.has('wind') ? '<g class="weather-fx" fill="none" stroke="#74b3ad" stroke-width="5" stroke-linecap="round" opacity=".8"><path d="M76 242q57-28 98-2t73-3"/><path d="M91 270q43-20 75-1t55-2"/></g>' : '';
  const worm = activeTypes.has('worm') ? '<g transform="translate(518 385)" stroke="#527c4e" stroke-width="2"><path d="M0 8q9-17 18-3t17-1" fill="none" stroke-width="6" stroke-linecap="round"/><circle cx="1" cy="6" r="6" fill="#9dc879"/><circle cx="14" cy="5" r="6" fill="#add283"/><circle cx="27" cy="6" r="6" fill="#9dc879"/><circle cx="35" cy="4" r="5" fill="#add283"/><circle cx="36" cy="3" r="1.5" fill="#233f34"/></g>' : '';
  const stormStress = activeTypes.has('trouble') ? '<g fill="#e59b70"><circle cx="345" cy="596" r="8"/><circle cx="417" cy="604" r="6"/></g><path d="M335 578l-16-11m102 18 14-13" stroke="#a8714f" stroke-width="5" stroke-linecap="round"/>' : '';
  const groundColor = stats.health < 48 ? '#bbbf84' : '#86efac';
  const baseTufts = `<g transform="translate(322 627)"><circle cx="-6" cy="-2" r="12" fill="#4ade80"/><circle cx="2" cy="-5" r="11" fill="#86efac"/><circle cy="2" r="9" fill="#22c55e"/></g><g transform="translate(438 627)"><circle cx="6" cy="-2" r="12" fill="#22c55e"/><circle cx="-1" cy="-5" r="11" fill="#86efac"/><circle cy="2" r="9" fill="#4ade80"/></g>`;
  const gardenGround = '<ellipse cx="380" cy="646" rx="166" ry="26" fill="#57945c" opacity=".19"/><g fill="#fff5cf"><circle cx="250" cy="631" r="4"/><circle cx="278" cy="655" r="3"/><circle cx="495" cy="637" r="4"/><circle cx="520" cy="659" r="3"/></g>';
  const personalScene = `<path d="M0 530Q240 460 440 510T800 520V700H0Z" fill="#bae6fd" opacity=".48"/><path d="M0 560Q320 500 580 560T800 560V800H0Z" fill="#bbf7d0" opacity=".55"/><circle cx="640" cy="140" r="160" fill="url(#sun-${person.id})"/><circle cx="640" cy="140" r="35" fill="#fffbeb" opacity=".9"/><circle cx="380" cy="350" r="${Math.min(260, 60 + week * 3.8)}" fill="url(#aura-${person.id})"/><path d="M520 550C490 580 430 600 440 630C455 660 520 680 530 715Q550 770 690 800H800V730C700 695 620 650 590 610Q560 565 540 550Z" fill="url(#river-${person.id})"/><path d="M530 570C470 620 500 670 580 725T780 800M550 605Q495 655 630 755" stroke="white" stroke-width="4" stroke-linecap="round" fill="none" opacity=".74"/><path d="M0 580Q180 550 360 585T410 665Q380 700 440 775L460 800H0Z" fill="url(#hill-${person.id})"/><path d="M560 555Q680 535 800 565V730Q630 645 600 605Z" fill="#4ade80" opacity=".82"/><g transform="translate(240 630)" fill="white"><circle cx="-3" r="3"/><circle cx="3" r="3"/><circle cy="-3" r="3"/><circle cy="3" r="3"/><circle r="2" fill="#fbbf24"/></g><g transform="translate(280 650)" fill="#fed7aa"><circle cx="-3" r="3"/><circle cx="3" r="3"/><circle cy="-3" r="3"/><circle cy="3" r="3"/><circle r="2" fill="#f59e0b"/></g>`;
  const canopyTop = week <= 3 ? baseY - week * 22 - 20 : week <= 13 ? baseY - (60 + week * 14) - 40 : Math.max(275, 410 - week * 2.3) - Math.min(180, 45 + week * 2.7) - 20;
  const blessingFlowers = Array.from({ length: Math.min(6, stats.blessingCount) }, (_, index) => {
    const x = baseX + (index % 3 - 1) * 42, y = week <= 13 ? baseY - (60 + week * 14) - 18 + Math.floor(index / 3) * 25 : Math.max(290, 410 - week * 2.3) + Math.floor(index / 3) * 24;
    return `<g transform="translate(${x} ${y})" class="blessing-flower"><circle cx="-5" r="4" fill="#fda4af"/><circle cx="5" r="4" fill="#fecdd3"/><circle cy="-5" r="4" fill="#fff1f2"/><circle cy="5" r="4" fill="#fb7185"/><circle r="2.6" fill="#fbbf24"/></g>`;
  }).join('');
  const gardenWidth = week <= 13 ? Math.max(165, 150 + week * 9) : Math.min(520, 125 + week * 7.6);
  const gardenTop = Math.max(120, canopyTop);
  const gardenHeight = 660 - gardenTop;
  return `<svg viewBox="${gardenMode ? `${(380 - gardenWidth / 2).toFixed(0)} ${gardenTop.toFixed(0)} ${gardenWidth.toFixed(0)} ${gardenHeight.toFixed(0)}` : '0 0 800 800'}" role="img" aria-label="${escapeHTML(person.name)}的第${stage}階段繪本生命樹，已完成${progressDays}天讀經">
    <defs>
      <radialGradient id="sun-${person.id}" cx="50%" cy="50%" r="50%"><stop stop-color="#fef08a" stop-opacity=".8"/><stop offset=".45" stop-color="#fed7aa" stop-opacity=".4"/><stop offset="1" stop-color="#bae6fd" stop-opacity="0"/></radialGradient>
      <radialGradient id="aura-${person.id}" cx="50%" cy="50%" r="50%"><stop stop-color="#fef08a" stop-opacity=".48"/><stop offset=".62" stop-color="#bbf7d0" stop-opacity=".2"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
      <linearGradient id="trunk-${person.id}" x1="0" x2="1"><stop stop-color="#9a5a3a"/><stop offset=".38" stop-color="#c8825c"/><stop offset=".72" stop-color="#df9a75"/><stop offset="1" stop-color="#8a4d30"/></linearGradient>
      <radialGradient id="leaf-${person.id}" cx="35%" cy="30%" r="70%"><stop stop-color="${stats.missedStreak ? '#fef9c3' : season === 'autumn' ? '#fef3c7' : '#bbf7d0'}"/><stop offset=".45" stop-color="${stats.missedStreak ? '#e6cf69' : season === 'autumn' ? '#fbbf24' : '#4ade80'}"/><stop offset=".9" stop-color="${stats.missedStreak ? '#b9a74f' : season === 'autumn' ? '#ea580c' : '#16a34a'}"/><stop offset="1" stop-color="${stats.missedStreak ? '#8c8042' : season === 'autumn' ? '#9a3412' : '#15803d'}"/></radialGradient>
      <linearGradient id="leaf-shine-${person.id}" x2="0" y2="1"><stop stop-color="#dcfce7" stop-opacity=".9"/><stop offset="1" stop-color="#86efac" stop-opacity=".2"/></linearGradient>
      <linearGradient id="sprout-${person.id}" x2="0" y2="1"><stop stop-color="#bef264"/><stop offset="1" stop-color="#4ade80"/></linearGradient>
      <linearGradient id="fruit-${person.id}" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".28" stop-color="#fef08a"/><stop offset=".7" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>
      <linearGradient id="river-${person.id}" x1="0" x2="1"><stop stop-color="#38bdf8"/><stop offset=".5" stop-color="#60a5fa"/><stop offset="1" stop-color="#3b82f6"/></linearGradient>
      <linearGradient id="hill-${person.id}" x2="0" y2="1"><stop stop-color="${stats.missedStreak >= 2 ? '#d8ce91' : '#86efac'}"/><stop offset=".45" stop-color="${stats.missedStreak >= 2 ? '#aeb07a' : groundColor}"/><stop offset="1" stop-color="${stats.missedStreak >= 2 ? '#8e9866' : '#22c55e'}"/></linearGradient>
      <filter id="leaf-shadow"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#166534" flood-opacity=".2"/></filter><filter id="trunk-shadow"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#78350f" flood-opacity=".2"/></filter><filter id="fruit-shadow"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#d97706" flood-opacity=".35"/></filter><filter id="bird-shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#334155" flood-opacity=".16"/></filter>
    </defs>
    ${gardenMode ? gardenGround : personalScene}
    <g class="tree-canopy">${trunk}${branches}${leaves}${blossoms}${fruits}${bird}${baseTufts}${blessingFlowers}</g>${gardenMode ? '' : weatherOverlay(weather)}${storm}${worm}${stormStress}
  </svg>`;
}
