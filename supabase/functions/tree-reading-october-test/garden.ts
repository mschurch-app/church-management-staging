import {emptyState,refreshState,applyCommand,validDay} from '../tree-garden/engine.ts';
import {festivalTestForDate} from '../../../life-tree-festival-test-schedule.mjs';
const START='2026-10-01',END='2026-10-31';
function themeFor(today:string){
 const slot=festivalTestForDate(today);
 if(!slot)return {id:'garden',name:'十月箴言 · 與神同行',items:[],music:'',day:1};
 const {item,day}=slot;
 const items:Record<string,string[]>={newyear:['fireworks'],spring:['redpacket'],dragon:['dumpling'],moon:['mooncake'],thanksgiving:['turkey'],christmas:['reindeer']};
 return {id:item.id,name:slot.label,day,items:item.id==='easter'?day===1?['donkey']:day===5?['bread','chalice']:day===6?['cross']:day===8?['egg']:[]:items[item.id]||[],music:item.musicByDay?.[day-1]||({anniversary:'anniversary',light:'light'} as Record<string,string>)[item.id]||item.id};
}
export async function octoberGarden(db:any,participant:any,body:any,today:string){
 const subject=participant.line_subject,action=body.command||'me',theme=themeFor(today);
 if(!['me','avatar','equip','read','water','journal','place','move','hit','engage','retreat','attack'].includes(action))throw Error('invalid_action');
 if(action!=='me'&&(today<START||today>END))throw Error('test_closed');
 if(action!=='me'&&!/^[0-9a-f-]{36}$/.test(body.requestId||''))throw Error('invalid_request');
 if(action==='avatar'&&typeof body.avatar!=='string'||['equip','place'].includes(action)&&typeof body.item!=='string')throw Error('invalid_action');
 if(['read','water','journal'].includes(action)&&(!validDay(body.day||today)||(body.day||today)<START||(body.day||today)>END))throw Error('date_not_allowed');
 const initial=emptyState(today);initial.startDate=participant.reading_start_date;
 const inserted=await db.from('tree_reading_october_game_states').upsert({line_subject:subject,state:initial},{onConflict:'line_subject',ignoreDuplicates:true});
 if(inserted.error)throw Error('unavailable');
 const [saved,progress,journal]=await Promise.all([
  db.from('tree_reading_october_game_states').select('state,version').eq('line_subject',subject).single(),
  db.from('tree_reading_october_test_progress').select('reading_date,completion_type,completed_at,watered_at').eq('line_subject',subject).order('reading_date'),
  db.from('tree_reading_october_test_journal').select('reading_date,note').eq('line_subject',subject).order('reading_date'),
 ]);
 if(saved.error||progress.error||journal.error)throw Error('unavailable');
 const s=structuredClone(saved.data.state);s.startDate=participant.reading_start_date;
 // Always merge canonical records, including anything saved through the legacy page.
 for(const row of progress.data){
  if(!validDay(row.reading_date)||row.reading_date<START||row.reading_date>END||row.reading_date>today)continue;
  const existing=s.records.find((v:any)=>v.reading_date===row.reading_date);
  if(existing)Object.assign(existing,{...row,watered_at:row.watered_at||existing.watered_at});
  else s.records.push({...row,boosted:false});
 }
 for(const row of journal.data){
  if(!s.records.some((v:any)=>v.reading_date===row.reading_date))continue;
  const existing=s.notes.find((v:any)=>v.reading_date===row.reading_date);
  if(existing)existing.note=row.note;else s.notes.push(row);
 }
 s.legacyImported=true;refreshState(s,today,theme);
 // Request receipts make retried writes idempotent. Canonical writes occur only
 // once, in the same SQL transaction as the successful game version update.
 const repeated=action!=='me'&&s.receipts.includes(body.requestId);
 if(action!=='me'&&!repeated){
  const e=s.encounters[today];
  if(['engage','retreat','attack'].includes(action)){
   if(body.day!==today||!/^[0-9a-f-]{36}$/.test(body.session||''))throw Error('invalid_action');
   if(action==='retreat'){if(e.combat?.session===body.session)e.combat.active=false;}
   else{
    if(body.stage!==e.stage||e.stage>=6)throw Error('stale_event');
    if(s.life.hp<=0)throw Error('rest_needed');if(s.life.mp<=0)throw Error('mp_needed');
    if(action==='engage')e.combat={session:body.session,at:Date.now(),active:true};
    else{
     if(!e.combat?.active||e.combat.session!==body.session)throw Error('stale_event');
     const boss=e.boss&&e.stage>=3,interval=boss?5000:8000;
     if(Date.now()-e.combat.at>=interval){
      const hp=Math.min(s.life.hp,boss?10:5),mp=Math.min(s.life.mp,boss?6:3);
      s.life.hp-=hp;s.life.mp-=mp;e.combat.at=Date.now();
      e.lastAttack={id:body.requestId,hp,mp,at:e.combat.at,boss};
      if(s.life.hp<=0||s.life.mp<=0)e.combat.active=false;
     }
    }
   }
  }else{
   const stage=e.stage;applyCommand(s,action,body,today,{counterOnHit:false,waterCare:true});
   if(action==='hit'&&stage!==e.stage&&e.combat)e.combat.active=false;
  }
  s.receipts=[...s.receipts.slice(-63),body.requestId];
 }
 refreshState(s,today,theme);
 let version=saved.data.version;
 if(JSON.stringify(s)!==JSON.stringify(saved.data.state)){
  const write=await db.rpc('october_garden_save',{p_subject:subject,p_version:version,p_state:s,p_action:repeated?'me':action,p_day:body.day||today});
  if(write.error)throw Error(['date_not_allowed','read_first','invalid_note','join_required'].find(v=>write.error.message.includes(v))||'unavailable');
  if(!write.data)throw Error('conflict');version++;
 }
 return {ok:true,state:s,version,today,serverNow:Date.now(),profile:{name:participant.display_name,group_name:null,team_enabled:false,birthday_today:false},theme,team:null,plan:null,readingWindow:{start:START,end:END},mode:'october-test'};
}
