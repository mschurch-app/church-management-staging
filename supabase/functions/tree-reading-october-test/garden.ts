import {completeOpening} from '../../../prototypes/reading-tree-game/tree-game-opening-state.mjs';
import {emptyState,refreshState,applyCommand,validDay} from '../tree-garden/engine.ts';
import {festivalTestForDate} from '../../../life-tree-festival-test-schedule.mjs';
import {FESTIVAL_MISSIONS} from './festival-missions.ts';
import {missionFor,acceptMission,answerMission,completeMission,publicMission} from './personal-missions.ts';
const START='2026-10-01',END='2026-10-31';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEAM_COMMANDS=['team','invite','join','leave','care'];
const TEAM_ERRORS=['join_required','test_closed','invite_invalid','team_already_joined','care_limit','care_forbidden','invalid_message','invalid_request'];
async function tokenDigest(token:string){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
 return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
function themeFor(today:string){
 const slot=festivalTestForDate(today);
 if(!slot)return {id:'garden',name:'十月箴言 · 與神同行',items:[],music:'',day:1};
 const {item,day}=slot;
 const items:Record<string,string[]>={newyear:['fireworks'],spring:['redpacket'],dragon:['dumpling'],moon:['mooncake'],thanksgiving:['turkey'],christmas:['reindeer']};
 return {id:item.id,name:slot.label,day,items:item.id==='easter'?day===1?['donkey']:day===5?['bread','chalice']:day===6?['cross']:day===8?['egg']:[]:items[item.id]||[],music:item.musicByDay?.[day-1]||({anniversary:'anniversary',light:'light'} as Record<string,string>)[item.id]||item.id};
}
async function missionEvidence(idToken:string,since:string){
 try{
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/line-member',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json',origin:'https://mscos.mchurch.online'},body:JSON.stringify({action:'mission_evidence',church:'M+',idToken,since})});
  const data=await response.json();if(!response.ok||!data.ok)throw Error('evidence_unavailable');
  return {...data,available:true};
 }catch{return {evidence:{share:0,prayer:0,prayerCreate:0},service:null,available:false};}
}
export async function octoberGarden(db:any,participant:any,body:any,today:string,idToken:string){
 const subject=participant.line_subject,action=body.command||'me',theme=themeFor(today),teamCommand=TEAM_COMMANDS.includes(action),gameCommand=action!=='me'&&!teamCommand;
 if(!['me','avatar','equip','read','water','journal','place','move','hit','engage','retreat','attack','festival_answer','festival_complete','mission_accept','mission_answer',...TEAM_COMMANDS].includes(action))throw Error('invalid_action');
 if(!['me','team','mission_answer'].includes(action)&&(today<START||today>END))throw Error('test_closed');
 if(!['me','team'].includes(action)&&(typeof body.requestId!=='string'||!UUID.test(body.requestId)))throw Error('invalid_request');
 if(action==='join'&&(typeof body.token!=='string'||!UUID.test(body.token)))throw Error('invite_invalid');
 if(action==='care'&&(typeof body.recipient!=='string'||!UUID.test(body.recipient)))throw Error('invalid_request');
 if(action==='care'&&(typeof body.message!=='string'||body.message.length>120))throw Error('invalid_message');
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
 let s=structuredClone(saved.data.state);s.startDate=participant.reading_start_date;
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
 s.festivalMissions ||= {};
 const personal=await missionFor(s,subject,today);
 let evidence=await missionEvidence(idToken,personal.active?.acceptedAt||'1970-01-01T00:00:00.000Z');
 s.weeklyServiceMissions||={};
 if(evidence.available)for(const date of evidence.service?.completedDates||[])if(!s.weeklyServiceMissions[date])s.weeklyServiceMissions[date]={completedAt:new Date().toISOString(),source:'published_bulletin_and_bound_member_name'};
 if(personal.active&&evidence.available&&((personal.active.kind==='share'&&evidence.evidence.share>=3)||(personal.active.kind==='prayer'&&(evidence.evidence.prayer>=1||evidence.evidence.prayerCreate>=1))))completeMission(personal);
 const festivalSlot=festivalTestForDate(today),festivalMission=festivalSlot&&FESTIVAL_MISSIONS[festivalSlot.key];
 // Request receipts make retried writes idempotent. Canonical writes occur only
 // once, in the same SQL transaction as the successful game version update.
 const repeated=gameCommand&&s.receipts.includes(body.requestId);
 if(gameCommand&&!repeated){
  const e=s.encounters[today];
  if(action==='mission_accept'){
   await acceptMission(personal,subject,today);
   evidence=await missionEvidence(idToken,personal.active?.acceptedAt||'1970-01-01T00:00:00.000Z');
  }else if(action==='mission_answer'){
   answerMission(personal,Number(body.questionId),Number(body.choice));
  }else if(['festival_answer','festival_complete'].includes(action)){
   if(!festivalSlot||!festivalMission)throw Error('mission_unavailable');
   const entry=s.festivalMissions[today];
   if(action==='festival_answer'){
    if(!Number.isInteger(body.choice)||body.choice<0||body.choice>=festivalMission.choices.length)throw Error('invalid_action');
    if(body.choice!==festivalMission.answer)throw Error('mission_wrong');
    if(!entry)s.festivalMissions[today]={key:festivalSlot.key,answered_at:new Date().toISOString()};
   }else{
    if(entry?.key!==festivalSlot.key||!entry.answered_at)throw Error('mission_answer_first');
    if(!entry.completed_at)entry.completed_at=new Date().toISOString();
   }
  }else if(['engage','retreat','attack'].includes(action)){
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
   if(action==='avatar'&&body.openingVersion!==undefined)completeOpening(s,body.openingVersion);
   if(action==='hit'&&stage!==e.stage&&e.combat)e.combat.active=false;
  }
  s.receipts=[...s.receipts.slice(-63),body.requestId];
 }
 refreshState(s,today,theme);
 let version=saved.data.version;
 if(JSON.stringify(s)!==JSON.stringify(saved.data.state)){
  const write=await db.rpc('october_garden_save',{p_subject:subject,p_version:version,p_state:s,p_action:teamCommand||repeated||action.startsWith('festival_')||action.startsWith('mission_')?'me':action,p_day:body.day||today});
  if(write.error)throw Error(['date_not_allowed','read_first','invalid_note','join_required'].find(v=>write.error.message.includes(v))||'unavailable');
  if(!write.data)throw Error('conflict');version++;
 }
 let care=null;
 if(action==='care'){
  const result=await db.rpc('october_garden_send_care',{p_subject:subject,p_recipient:body.recipient,p_request:body.requestId,p_message:body.message});
  if(result.error)throw Error(TEAM_ERRORS.find(value=>result.error.message.includes(value))||'unavailable');
  care=result.data;
 }
 // Team tokens never bypass the original test-participant gate in index.ts.
 // A new raw token is returned once; the database only receives its digest.
 const invite=action==='invite'?crypto.randomUUID():null;
 const teamResult=await db.rpc('october_garden_team',{p_subject:subject,p_action:['invite','join','leave'].includes(action)?action:'team',p_token_hash:invite?await tokenDigest(invite):action==='join'?await tokenDigest(body.token):null});
 if(teamResult.error)throw Error(TEAM_ERRORS.find(value=>teamResult.error.message.includes(value))||'unavailable');
 const team={...teamResult.data,...(invite?{invite}:{})};
 if(teamCommand){
  // A different teammate may have sent care while this request was in flight.
  // Never return the earlier snapshot over a newer recipient version.
  const latest=await db.from('tree_reading_october_game_states').select('state,version').eq('line_subject',subject).single();
  if(latest.error)throw Error('unavailable');s=latest.data.state;version=latest.data.version;
 }
 return {ok:true,state:s,version,today,serverNow:Date.now(),profile:{name:participant.display_name,group_name:team.enabled?team.group_name:null,team_enabled:team.enabled,birthday_today:false},theme,team,care,personalMission:publicMission(personal,today,evidence.evidence),missionEvidenceAvailable:evidence.available,weeklyService:evidence.service,mission:festivalSlot&&festivalMission?{key:festivalSlot.key,label:festivalSlot.label,reference:festivalSlot.item.days[festivalSlot.day-1].reference,reflection:festivalSlot.item.days[festivalSlot.day-1].reflection,question:festivalMission.question,choices:festivalMission.choices,action:festivalMission.action,result:festivalMission.result,reward:10}:null,plan:null,readingWindow:{start:START,end:END},mode:'october-test'};
}
