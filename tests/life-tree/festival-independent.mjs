import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {readingProgress} from '../../prototypes/reading-tree-game/tree-game-progress.mjs';
import {festivalTestForDate} from '../../life-tree-festival-test-schedule.mjs';

const root=new URL('../../',import.meta.url);
const source=path=>stripTypeScriptTypes(fs.readFileSync(new URL(path,root),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''));
const today='2026-10-14',slot=festivalTestForDate(today);
assert(slot,'fixture date has a festival task');
const missions=vm.runInNewContext(source('supabase/functions/tree-reading-october-test/festival-missions.ts')+';FESTIVAL_MISSIONS');
const context=vm.createContext({crypto:webcrypto,Date,Intl,structuredClone,Uint32Array,TextEncoder,AbortSignal,
  completeOpening:()=>{},festivalTestForDate,FESTIVAL_MISSIONS:missions,
  missionFor:async state=>state.personalMissions||={daily:{},completed:[],answeredIds:[]},
  publicMission:()=>null,fetch:async()=>{throw Error('fixture: no external calls');}});
vm.runInContext(source('supabase/functions/tree-garden/engine.ts'),context);
vm.runInContext(source('supabase/functions/tree-reading-october-test/garden.ts'),context);
const initial=vm.runInContext(`emptyState('${today}')`,context);
Object.assign(initial,{startDate:'2026-10-01',legacyImported:true,records:[],notes:[],festivalMissions:{}});
let saved={state:structuredClone(initial),version:1},writes=0;
const db={from(table){let op='select';const q={upsert(){op='upsert';return q;},select(){return q;},eq(){return q;},single(){return q;},order(){return q;},then(resolve){return Promise.resolve({data:op==='upsert'?null:table==='tree_reading_october_game_states'?structuredClone(saved):[],error:null}).then(resolve);}};return q;},
  async rpc(name,p){if(name==='october_garden_team')return {data:{enabled:false},error:null};assert.equal(name,'october_garden_save');writes++;saved={state:structuredClone(p.p_state),version:saved.version+1};return {data:true,error:null};}};
context.db=db;context.participant={line_subject:'synthetic',reading_start_date:'2026-10-01',display_name:'Isolated test'};
async function call(command,extra={}){context.payload={command,requestId:webcrypto.randomUUID(),...extra};return vm.runInContext(`octoberGarden(db,participant,payload,'${today}','fake-token')`,context);}
await assert.rejects(call('festival_complete'),/mission_answer_first/);
await assert.rejects(call('festival_answer',{choice:(missions[slot.key].answer+1)%missions[slot.key].choices.length}),/mission_wrong/);
await call('festival_answer',{choice:missions[slot.key].answer});
assert.equal(saved.state.records.length,0);
assert.equal(saved.state.festivalMissions[today].completed_at,undefined);
await call('festival_complete');
const completedAt=saved.state.festivalMissions[today].completed_at;
assert(completedAt);
assert.equal(saved.state.records.length,0,'festival completion does not create a daily reading');
assert.equal(readingProgress({...saved.state,today}).breakdown.festival,10,'festival XP is independent of reading XP');
assert.equal(readingProgress({...saved.state,today}).breakdown.reading,0);
const afterFirst=writes;
await call('festival_complete');
assert.equal(saved.state.festivalMissions[today].completed_at,completedAt,'repeat completion keeps the original award');
assert.equal(readingProgress({...saved.state,today}).breakdown.festival,10);
assert.equal(writes,afterFirst+1,'a distinct request records its receipt without awarding extra XP');
console.log('PASS: unanswered and wrong festival tasks are blocked; a correct task completes once with +10 XP before daily reading');
