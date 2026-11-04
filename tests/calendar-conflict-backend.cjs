const fs=require('fs'),assert=require('assert/strict'),vm=require('vm'),{stripTypeScriptTypes}=require('module');
const source=fs.readFileSync(require('path').resolve(__dirname,'../supabase/functions/pastoral-google-calendar/index.ts'),'utf8');
const create=source.slice(source.indexOf('async function createCalendarEvent('),source.indexOf('\n\nfunction validCalendarDate'));
const list=source.slice(source.indexOf('async function listSharedEvents('),source.indexOf('\n\nfunction canonicalCalendarStaff'));
const handle=source.slice(source.indexOf('async function handleAction('),source.indexOf('\nDeno.serve('));
(async()=>{let posts=[],already=false,busy=[{start:'2026-11-10T01:30:00Z',end:'2026-11-10T02:30:00Z'}],target=true,policy=null;
const staff={id:'staff-own',role:'pastor',entityKeys:['mplus']};
const ctx=vm.createContext({console,Request,Response,URL,Date,BUFFER_MS:1800000,CALENDAR_ID:'calendar@example.invalid',APP_ORIGIN:'https://example.invalid',AbortSignal,
 eventAlreadyCreated:async()=>already,freeBusy:async()=>busy,calendarEventTitle:(s,n)=>n+' · '+s,
 sendCoworkerPush:async()=>{},notifyStaffDual:async()=>{},eventPermissions:()=>({canReport:false,canCancel:false}),handleWorkPlanner:async()=>null,
 readAppointment:b=>({summary:b.summary,location:'',start:Date.parse(b.start),end:Date.parse(b.end),emergency:false}),
 scheduleTarget:async()=>target?'staff-own':null,resolveMeetingParticipants:async()=>[{id:'staff-own',display_name:'測試同工',line_subject:null}],schedulePreferences:async()=>({}),scheduleError:()=>policy,accessToken:async()=>'fixture-token',
 notifyMeetingParticipants:async()=>{throw Error('no notifications in tests');},json:(origin,data,status=200)=>({status,data}),
 fetch:async(url,opt={})=>{if(opt.method==='POST'){posts.push(JSON.parse(opt.body));already=true;return Response.json({id:'fixture'});}return Response.json({items:[{id:'private',summary:'不可公開的私人標題',visibility:'private',start:{dateTime:'2026-11-10T01:30:00Z'},end:{dateTime:'2026-11-10T02:30:00Z'}},{id:'clear',summary:'透明行程',transparency:'transparent',start:{dateTime:'2026-11-10T01:30:00Z'},end:{dateTime:'2026-11-10T02:30:00Z'}},{id:'named',summary:'測試場地預備',start:{dateTime:'2026-11-10T01:30:00Z'},end:{dateTime:'2026-11-10T02:30:00Z'}}]});}
});
vm.runInContext(stripTypeScriptTypes(create+'\n'+list+'\n'+handle+'\nglobalThis.run=handleAction;'),ctx);
const payload={action:'create-event',confirmed:true,requestId:'00000000-0000-4000-8000-000000000001',summary:'測試新增工作',start:'2026-11-10T02:00:00Z',end:'2026-11-10T03:00:00Z',notifyParticipants:false};
const run=b=>ctx.run(new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}),{},staff);
let r=await run(payload);assert.equal(r.status,409);assert.equal(posts.length,0);assert.equal(r.data.canOverride,true);assert.equal(r.data.bufferMinutes,30);assert.equal(r.data.conflicts.length,2);assert(r.data.conflicts.some(e=>e.summary==='私人行程'));assert(!JSON.stringify(r).includes('不可公開的私人標題'));assert(!JSON.stringify(r).includes('透明行程'));assert(r.data.conflicts.some(e=>e.summary==='測試場地預備'));console.log('PASS conflicts include work and times, mask private titles, skip transparent events; no write');
r=await run({...payload,allowConflict:true});assert.equal(r.status,400);assert.equal(posts.length,0);console.log('PASS cannot override without explicit second confirmation');
r=await run({...payload,allowConflict:true,conflictConfirmed:true});assert.equal(r.status,200);assert.equal(r.data.conflictOverride,true);assert.equal(posts.length,1);assert.equal(posts[0].extendedProperties.private.mplusConflictOverride,'confirmed');console.log('PASS explicit override creates one event and records confirmation');
await run({...payload,allowConflict:true,conflictConfirmed:true});assert.equal(posts.length,1);console.log('PASS replay of confirmed request is idempotent');
already=false;target=false;r=await run({...payload,allowConflict:true,conflictConfirmed:true});assert.equal(r.status,403);target=true;policy='rest_day';r=await run({...payload,allowConflict:true,conflictConfirmed:true});assert.equal(r.status,409);assert.equal(r.data.error,'rest_day');assert.equal(posts.length,1);console.log('PASS override preserves target authorization and rest/work-hour policy');
policy=null;busy=[];r=await run({...payload,requestId:'00000000-0000-4000-8000-000000000002'});assert.equal(r.status,200);assert.equal(r.data.conflictOverride,false);assert.equal(posts.length,2);console.log('PASS non-conflicting work keeps normal one-step creation');
})().catch(e=>{console.error(e);process.exit(1);});
