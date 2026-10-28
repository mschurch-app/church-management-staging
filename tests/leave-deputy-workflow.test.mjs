import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000003';
const D='00000000-0000-4000-8000-000000000004';

function fixture({lineStatus='sent',entityKey='mplus'}={}){
 const tables={
  pastoral_staff_access:[A,B,C,D].map(staff_id=>({staff_id,entity_key:entityKey})),
  pastoral_staff:[
   {id:A,display_name:'合成申請人',role:'secretary',is_active:true},
   {id:B,display_name:'合成代理人',role:'secretary',is_active:true},
   {id:C,display_name:'合成主管',role:'pastor',is_active:true},
   {id:D,display_name:'合成其他人',role:'secretary',is_active:true},
  ],pastoral_staff_leave_requests:[],pastoral_notification_deliveries:[],
 };
 const sent=[];
 class Query{
  constructor(table){this.table=table;this.filters=[];this.mode='read';this.value=null;this.max=Infinity;}
  select(){return this;}
  eq(field,value){this.filters.push(row=>row[field]===value);return this;}
  in(field,values){this.filters.push(row=>values.includes(row[field]));return this;}
  lte(field,value){this.filters.push(row=>row[field]<=value);return this;}
  gte(field,value){this.filters.push(row=>row[field]>=value);return this;}
  or(value){const fields=value.split(',').map(item=>item.split('.'));this.filters.push(row=>fields.some(([field,,expected])=>row[field]===expected));return this;}
  order(){return this;}
  limit(value){this.max=value;return this;}
  insert(value){this.mode='insert';this.value=value;return this;}
  update(value){this.mode='update';this.value=value;return this;}
  upsert(value){this.mode='upsert';this.value=value;return this;}
  resolve(single=false){let rows=tables[this.table].filter(row=>this.filters.every(accept=>accept(row))).slice(0,this.max);
   if(this.mode==='insert'){const row={id:`00000000-0000-4000-8000-${String(tables[this.table].length+100).padStart(12,'0')}`,...this.value};tables[this.table].push(row);rows=[row];}
   if(this.mode==='update'){rows.forEach(row=>Object.assign(row,this.value));}
   if(this.mode==='upsert'){tables[this.table].push(this.value);rows=[this.value];}
   return {data:single?rows[0]||null:rows,error:null};
  }
  single(){return Promise.resolve(this.resolve(true));}
  maybeSingle(){return Promise.resolve(this.resolve(true));}
  then(resolve,reject){return Promise.resolve(this.resolve()).then(resolve,reject);}
 }
 const db={from:table=>new Query(table)};
 const source=readFileSync(new URL('../supabase/functions/pastoral-coworker-tools/index.ts',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'')+'\nglobalThis.testHandleJson=handleJson;';
 const scope={Deno:{serve(){}},console,Date,Intl,URLSearchParams,Response,AbortSignal,
  createClient(){throw Error('not used')},
  leaveCalendarId:'mbot@tcsc.org.tw',leaveCalendarEvent:leave=>({id:'l'+leave.id.replaceAll('-','')}),leaveEventId:id=>'l'+id.replaceAll('-',''),
  notifyStaffDual:async args=>{sent.push(args);return {status:lineStatus==='sent'?'sent':'failed',appStatus:'disabled',lineStatus};},
 };
 runInNewContext(stripTypeScriptTypes(source),scope);
 return {run:(actor,body)=>scope.testHandleJson(db,{id:actor,role:actor===C?'pastor':'secretary',entityKeys:[entityKey]},{entityKey,...body}),tables,sent};
}

test('deputy must confirm before manager review; unrelated staff cannot confirm; reason stays private',async()=>{
 const h=fixture(),created=await h.run(A,{action:'create-leave',startDate:'2026-11-10',endDate:'2026-11-10',period:'full_day',leaveType:'personal',deputyStaffId:B,reason:'私人原因'});
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'pending_substitute');
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].staffId,B);
 assert(!JSON.stringify(h.sent).includes('私人原因'));
 await assert.rejects(h.run(C,{action:'review-leave',leaveId:created.id,decision:'approved'}),{code:'leave_not_pending'});
 await assert.rejects(h.run(D,{action:'respond-leave-deputy',leaveId:created.id,decision:'accepted'}),{code:'leave_not_pending'});
 const visible=await h.run(B,{action:'list-leave'});assert.equal(visible.items[0].reason,'');
 await h.run(B,{action:'respond-leave-deputy',leaveId:created.id,decision:'accepted'});
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'pending');
 assert.equal(h.sent.at(-1).staffId,C);
 await assert.rejects(h.run(B,{action:'respond-leave-deputy',leaveId:created.id,decision:'accepted'}),{code:'leave_not_pending'});
 await h.run(C,{action:'review-leave',leaveId:created.id,decision:'approved'});
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'approved');
 assert.deepEqual(h.sent.slice(-2).map(call=>call.staffId),[A,B]);
 assert(!JSON.stringify(h.sent).includes('私人原因'));
});

test('deputy decline closes that request and returns it to applicant',async()=>{
 const h=fixture(),created=await h.run(A,{action:'create-leave',startDate:'2026-11-11',endDate:'2026-11-11',period:'full_day',leaveType:'annual',deputyStaffId:B});
 await h.run(B,{action:'respond-leave-deputy',leaveId:created.id,decision:'declined'});
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'substitute_declined');
 assert.equal(h.sent.at(-1).staffId,A);
 await assert.rejects(h.run(C,{action:'review-leave',leaveId:created.id,decision:'approved'}),{code:'leave_not_pending'});
});


test('LINE alone confirms leave delivery with App disabled',async()=>{
 const h=fixture(),created=await h.run(A,{action:'create-leave',startDate:'2026-11-12',endDate:'2026-11-12',period:'full_day',leaveType:'annual',deputyStaffId:B});
 assert.equal(created.notifications.confirmed,1);
 const receipt=h.tables.pastoral_notification_deliveries[0];
 assert.equal(receipt.app_status,'disabled');assert.equal(receipt.line_status,'sent');
 assert.equal(receipt.status,'sent');assert.equal(receipt.error_code,null);assert(receipt.sent_at);
});
test('failed LINE delivery preserves request and records an unconfirmed notification',async()=>{
 const h=fixture({lineStatus:'http_429'}),created=await h.run(A,{action:'create-leave',startDate:'2026-11-13',endDate:'2026-11-13',period:'full_day',leaveType:'annual',deputyStaffId:B});
 assert.equal(created.notifications.confirmed,0);assert.equal(created.notifications.recipients,1);
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'pending_substitute');
 const receipt=h.tables.pastoral_notification_deliveries[0];
 assert.equal(receipt.status,'failed');assert.equal(receipt.sent_at,null);assert.match(receipt.error_code,/line:http_429/);
});
test('SHiNE leave requests preserve workflow without sending notifications',async()=>{
 const h=fixture({entityKey:'shine'}),created=await h.run(A,{action:'create-leave',startDate:'2026-11-14',endDate:'2026-11-14',period:'full_day',leaveType:'annual',deputyStaffId:B});
 await h.run(B,{action:'respond-leave-deputy',leaveId:created.id,decision:'accepted'});
 await h.run(C,{action:'review-leave',leaveId:created.id,decision:'rejected'});
 assert.equal(created.notifications.disabled,true);assert.equal(h.sent.length,0);
 assert.equal(h.tables.pastoral_notification_deliveries.length,0);
 assert.equal(h.tables.pastoral_staff_leave_requests[0].status,'rejected');
});
