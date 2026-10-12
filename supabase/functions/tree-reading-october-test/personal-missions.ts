import {QUIZ_BANK} from './quiz-bank.ts';

export type MissionKind='quiz'|'share'|'prayer';
type Entry={kind:MissionKind;offeredAt:string;acceptedAt?:string;completedAt?:string;questionIds?:number[];correctIds?:number[];evidenceAfter?:string;baseline?:number};
type MissionState={daily:Record<string,Entry|null>;active?:Entry;completed:Entry[];answeredIds:number[]};
const kinds:MissionKind[]=['quiz','share','prayer'];
const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const cleanQuestion=(id:number)=>{const q=QUIZ_BANK.find(item=>item.id===id);return q?{id:q.id,question:q.question,choices:q.choices,hint:q.hint,reference:q.reference}:null;};
export async function missionFor(state:any,subject:string,today:string){
 const missions:MissionState=state.personalMissions||={daily:{},completed:[],answeredIds:[]};
 missions.daily||={};missions.completed||=[];missions.answeredIds||=[];
 if(/^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(today)&&!(today in missions.daily)){
  // An accepted mission stays open without a deadline. Daily allocation is
  // deterministic, so refreshing the page cannot reroll the offer.
  const salt=await digest(`mplus-october-mission-v1|${today}|${subject}`);
  missions.daily[today]=(missions.active||salt[0]>=128)?null:{kind:kinds[salt[1]%kinds.length],offeredAt:new Date().toISOString()};
 }
 return missions;
}
export async function acceptMission(missions:MissionState,subject:string,today:string){
 const offer=missions.daily[today];if(!offer||missions.active||offer.acceptedAt)throw Error('mission_unavailable');
 offer.acceptedAt=new Date().toISOString();offer.evidenceAfter=offer.acceptedAt;offer.baseline=0;
 if(offer.kind==='quiz'){
  const seed=await digest(`mplus-october-quiz-v1|${subject}|${today}|${missions.completed.length}`);
  const unseen=QUIZ_BANK.filter(q=>!missions.answeredIds.includes(q.id));
  const pool=unseen.length>=3?unseen:QUIZ_BANK;
  offer.questionIds=pool.map(q=>({id:q.id,weight:((q.id*1103515245+seed[0]*65537+seed[1]*257+seed[2])>>>0)})).sort((a,b)=>a.weight-b.weight).slice(0,3).map(q=>q.id);
  offer.correctIds=[];
 }
 missions.active=offer;
}
export function answerMission(missions:MissionState,id:number,choice:number){
 const active=missions.active;if(active?.kind!=='quiz'||!active.questionIds?.includes(id))throw Error('mission_unavailable');
 const q=QUIZ_BANK.find(item=>item.id===id);if(!q||!Number.isInteger(choice)||choice<0||choice>3)throw Error('invalid_action');
 if(q.answer!==choice)throw Error('mission_wrong');
 active.correctIds||=[];
 if(!active.correctIds.includes(id))active.correctIds.push(id);
 if(!missions.answeredIds.includes(id))missions.answeredIds.push(id);
 if(active.correctIds.length===3)completeMission(missions);
}
export function completeMission(missions:MissionState){
 const active=missions.active;if(!active||active.completedAt)return;
 active.completedAt=new Date().toISOString();missions.completed.push({...active});delete missions.active;
}
export function publicMission(missions:MissionState,today:string,evidence:{share:number;prayer:number;prayerCreate?:number}){
 const active=missions.active,offer=missions.daily[today];
 const visible=(entry:Entry|null|undefined)=>entry?{kind:entry.kind,offeredAt:entry.offeredAt,acceptedAt:entry.acceptedAt,completedAt:entry.completedAt,progress:entry.kind==='quiz'?(entry.correctIds?.length||0):Math.max(0,(entry.kind==='share'?evidence.share:Math.max(evidence.prayer,evidence.prayerCreate||0))-(entry.baseline||0)),goal:entry.kind==='share'||entry.kind==='quiz'?3:1,questions:entry.kind==='quiz'?entry.questionIds?.map(cleanQuestion).filter(Boolean):undefined,correctIds:entry.kind==='quiz'?entry.correctIds:undefined}:null;
 return {offer:visible(offer),active:visible(active),completed:missions.completed.length,xp:missions.completed.length*10};
}
