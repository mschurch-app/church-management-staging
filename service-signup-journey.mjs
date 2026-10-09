const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
export function journeySummary(data,year){
  const annual=data.service_journey?.years?.find(item=>Number(item.year)===Number(year));
  if(!Array.isArray(data.service_journey?.years))return null;
  return {year:Number(year),completed:count(annual?.completed_count),registered:count(annual?.registered_count),waiting:count(annual?.waitlisted_count)};
}
export function journeyEncouragement(summary){
  if(!summary)return '每一份願意都很珍貴。年度紀錄暫時無法載入，請稍後再查看。';
  if(summary.completed)return `謝謝你這一年 ${summary.completed} 次的擺上。每一次服事，都讓教會多一份溫暖。`;
  if(summary.registered)return `你已為這一年預備 ${summary.registered} 次服事登記。謝謝你願意踏出這一步，一起成為祝福。`;
  if(summary.waiting)return '謝謝你願意成為候補，這一份願意同樣珍貴。';
  return '服事從一份願意開始。謝謝你，讓我們一起留下美好的足跡。';
}
export function journeyCard(data,year){
  const summary=journeySummary(data,year),years=[...new Set([Number(year),...(data.service_journey?.years||[]).map(item=>Number(item.year))])].filter(item=>Number.isInteger(item)&&item>=2026&&item<=2100).sort((a,b)=>b-a);
  return `<section class="service-journey" aria-labelledby="journey-heading"><header><h2 id="journey-heading">恩典腳蹤</h2><label class="journey-year-label"><span class="sr-only">查看年度</span><select id="journey-year">${years.map(value=>`<option value="${value}" ${value===Number(year)?'selected':''}>${value} 年</option>`).join('')}</select></label></header>${summary?`<div class="journey-counts"><div><strong>${summary.completed}<small> 次</small></strong><span>累計服事</span></div><div><strong>${summary.registered}<small> 次</small></strong><span>已預備${summary.waiting?`・另有 ${summary.waiting} 次候補`:''}</span></div></div>`:'<p class="journey-unavailable">年度紀錄暫時無法載入</p>'}<p>${esc(journeyEncouragement(summary))}</p><small class="journey-note">累計採已確認排班且日期已過的紀錄；未來登記另列為已預備，候補不計入累計。</small></section>`;
}
