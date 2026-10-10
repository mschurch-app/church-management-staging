import {FESTIVALS} from './life-tree-festivals.mjs?v=20261010-season-test1';

export const FESTIVAL_TEST_START='2026-10-10';
const DAY=86400000;
const dateAt=offset=>new Date(Date.parse(FESTIVAL_TEST_START+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
export const FESTIVAL_TEST_SCHEDULE=Object.freeze(FESTIVALS.map((item,index)=>Object.freeze({item,start:dateAt(index*2),end:dateAt(index*2+1)})));
// Caller supplies its real Asia/Taipei calendar date. Never changes reading dates.
export function festivalTestForDate(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const index=FESTIVAL_TEST_SCHEDULE.findIndex(slot=>date>=slot.start&&date<=slot.end);
 if(index<0)return null;
 const slot=FESTIVAL_TEST_SCHEDULE[index];
 return {...slot,index,day:date===slot.start?1:slot.item.days.length,next:FESTIVAL_TEST_SCHEDULE[index+1]||null};
}
