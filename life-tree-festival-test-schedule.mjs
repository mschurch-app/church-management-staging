import {FESTIVALS} from './life-tree-festivals.mjs?v=20261010-daily-scenes1';

export const FESTIVAL_TEST_START='2026-10-10';
const DAY=86400000;
const dateAt=offset=>new Date(Date.parse(FESTIVAL_TEST_START+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
// Holy Week gets eight daily scenes; other festivals get one representative day.
const scenes=FESTIVALS.flatMap(item=>item.id==='easter'?item.days.map((_,index)=>({item,day:index+1})):[{item,day:item.id==='newyear'?1:item.days.length}]);
export const FESTIVAL_TEST_SCHEDULE=Object.freeze(scenes.map((scene,index)=>Object.freeze({...scene,key:scene.item.id+':'+scene.day,start:dateAt(index),end:dateAt(index),label:scene.item.id==='easter'?scene.item.days[scene.day-1].title:scene.item.name})));
// Caller supplies its real Asia/Taipei calendar date. Never changes reading dates.
export function festivalTestForDate(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const index=FESTIVAL_TEST_SCHEDULE.findIndex(slot=>date===slot.start);
 if(index<0)return null;
 const slot=FESTIVAL_TEST_SCHEDULE[index];
 return {...slot,index,next:FESTIVAL_TEST_SCHEDULE[index+1]||null};
}
