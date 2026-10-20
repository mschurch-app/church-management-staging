// Isolated browser fixture. No calendar, database or notification request leaves this page.
import {mountWeekCalendar} from '/mplus-week-calendar.mjs?v=20261021-work1';
import {taipeiDate,addDay} from '/mplus-week-model.mjs';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const params=new URLSearchParams(location.search),calls=[],routines=[];let finished=false,failed=false;
const log=document.createElement('pre');log.id='fixture-actions';log.hidden=true;document.body.append(log);
const api=async(action,payload={})=>{calls.push({action,...payload});log.textContent=JSON.stringify(calls);
 if(action==='routine-status')return {canAssign:!params.has('staff'),setupRequired:params.has('required')&&!finished,selfId:A,routines};
 if(action==='list-schedule-staff')return {staff:[{id:A,name:'示範同工',isSelf:true,role:params.has('staff')?'secretary':'pastor'},{id:B,name:'示範協作同工',role:'secretary'}]};
 if(params.has('failOnce')&&!failed&&action==='save-routine'){failed=true;throw Error('模擬連線中斷（尚未確認）');}
 if(action==='save-routine'){if(!routines.some(r=>r.id===payload.requestId))routines.push({id:payload.requestId,title:payload.summary,created_by:A,status:'active',canStop:true,definition:payload});return {id:payload.requestId,notifications:{sent:1,total:1}};}
 if(action==='finish-routine-setup'){finished=true;return {finished:true};}
 if(action==='assign-work')return {taskId:'fixture-task',notifications:{sent:1,total:1}};
 if(action==='report-work'||action==='stop-routine')return {notifications:{sent:1,total:1}};
 throw Error('Fixture action not supported: '+action);
};
document.querySelector('#welcome').textContent='示範同工｜合成資料';document.querySelector('#status').hidden=true;
mountWeekCalendar({allowed:true,loadPlanner:()=>api('routine-status'),plannerApi:api,loadData:async()=>({problems:[],tasks:[{id:'10000000-0000-4000-8000-000000000001',title:'預備主日場地（示範）',description:'設備與座位確認',workflow:'mplus_assignment',assignedToMe:true,createdByMe:true,status:'pending',assigneeName:'示範同工',dueAt:taipeiDate()+'T17:00:00+08:00',canApprove:true}],events:[]})});
