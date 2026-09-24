import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {BUFFER_MS, DEFAULT_WORK_DAYS, DEFAULT_WORK_END, DEFAULT_WORK_START, MEETING_MINUTES, scheduleError} from './calendar-policy.ts';

const CHANNEL_ID='2011645391';
const APP_ORIGIN='https://mscos.mchurch.online';
const CALENDAR_ID='mbot@tcsc.org.tw';
const CALENDAR_EMAIL='mbot@tcsc.org.tw';
const CALENDAR_SCOPES=[
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
];
const encoder=new TextEncoder();

function headers(origin:string, html=false){return {
  ...(origin===APP_ORIGIN?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-headers':'authorization,content-type,apikey',
  'access-control-allow-methods':'POST,OPTIONS,GET',
  'content-type':html?'text/html; charset=utf-8':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'pragma':'no-cache',
  'vary':'Origin',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
};}
function json(origin:string,value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:headers(origin)});}
function safePage(ok:boolean){
  const message=ok?'M+ 共用行事曆已連接。可以關閉此頁並返回「教會同工」工作台。':'Google 行事曆授權未完成。請返回工作台，稍後重試或聯絡管理者。';
  return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>教會同工行事曆</title><body><main><h1>${ok?'連接完成':'無法完成連接'}</h1><p>${message}</p><a href="${APP_ORIGIN}/pastoral/workspace.html">返回工作台</a></main></body></html>`,{status:ok?200:400,headers:headers('',true)});
}
function adminClient(){
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('config');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function verifyLineIdToken(token:string){
  if(!token||token.length>8192)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:CHANNEL_ID})});
    if(!response.ok)return null;
    const claims=await response.json(),now=Math.floor(Date.now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==CHANNEL_ID||!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||!/^U[0-9a-f]{32}$/.test(claims.sub))return null;
    return claims.sub as string;
  }catch{return null;}
}
type Staff={id:string;role:string;entityKeys:string[]};
async function staffFromRequest(request:Request,db:ReturnType<typeof adminClient>):Promise<Staff|null>{
  const match=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i);
  if(!match)return null;
  const subject=await verifyLineIdToken(match[1]);
  if(!subject)return null;
  const lookup=await db.from('pastoral_staff').select('id,role,is_active').eq('line_subject',subject).maybeSingle();
  if(lookup.error)throw new Error('db');
  if(!lookup.data||!lookup.data.is_active)return null;
  const access=await db.from('pastoral_staff_access').select('entity_key').eq('staff_id',lookup.data.id);
  if(access.error)throw new Error('db');
  return {id:lookup.data.id,role:lookup.data.role,entityKeys:[...new Set((access.data||[]).map((r:{entity_key:string})=>r.entity_key))]};
}
function base64url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function fromBase64url(value:string){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('state');
  const binary=atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function stateKey(clientSecret:string){return crypto.subtle.importKey('raw',encoder.encode(clientSecret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function makeState(staffId:string,clientSecret:string){
  const payload=base64url(encoder.encode(JSON.stringify({staffId,exp:Math.floor(Date.now()/1000)+600,nonce:base64url(crypto.getRandomValues(new Uint8Array(24)))})));
  const signature=await crypto.subtle.sign('HMAC',await stateKey(clientSecret),encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}
async function readState(value:string,clientSecret:string){
  const [payload,signature,extra]=value.split('.');
  if(!payload||!signature||extra)throw new Error('state');
  const valid=await crypto.subtle.verify('HMAC',await stateKey(clientSecret),fromBase64url(signature),encoder.encode(payload));
  if(!valid)throw new Error('state');
  const data=JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
  const now=Math.floor(Date.now()/1000);
  if(typeof data.staffId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.staffId)||!Number.isSafeInteger(data.exp)||data.exp<=now||data.exp>now+610||typeof data.nonce!=='string'||fromBase64url(data.nonce).length!==24)throw new Error('state');
  return data as {staffId:string;exp:number;nonce:string};
}
function redirectUri(){
  const base=Deno.env.get('SUPABASE_URL');
  if(!base)throw new Error('config');
  return new URL('/functions/v1/pastoral-google-calendar',base).toString();
}
async function startConnect(staff:Staff,db:ReturnType<typeof adminClient>){
  if(staff.role!=='pastor'&&staff.role!=='admin')return json(APP_ORIGIN,{ok:false,error:'pastor_required'},403);
  if(!staff.entityKeys.includes('mplus'))return json(APP_ORIGIN,{ok:false,error:'mplus_access_required'},403);
  const clientId=Deno.env.get('GOOGLE_CLIENT_ID')||'';
  const clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')||'';
  if(!clientId||!clientSecret)return json(APP_ORIGIN,{ok:false,error:'calendar_not_configured'},503);
  const authUrl=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',clientId);
  authUrl.searchParams.set('redirect_uri',redirectUri());
  authUrl.searchParams.set('response_type','code');
  authUrl.searchParams.set('scope',CALENDAR_SCOPES.join(' '));
  authUrl.searchParams.set('access_type','offline');
  authUrl.searchParams.set('prompt','consent');
  authUrl.searchParams.set('include_granted_scopes','true');
  authUrl.searchParams.set('login_hint',CALENDAR_EMAIL);
  authUrl.searchParams.set('state',await makeState(staff.id,clientSecret));
  return json(APP_ORIGIN,{ok:true,authorizationUrl:authUrl.toString()});
}
async function storeRefreshToken(db:ReturnType<typeof adminClient>,token:string){
  const result=await db.rpc('pastoral_store_google_refresh_token',{p_token:token});
  if(result.error)throw new Error('vault');
}
async function getRefreshToken(db:ReturnType<typeof adminClient>){
  const result=await db.rpc('pastoral_get_google_refresh_token');
  if(result.error)throw new Error('vault');
  return typeof result.data==='string'?result.data:'';
}
async function callback(request:Request,db:ReturnType<typeof adminClient>){
  const query=new URL(request.url).searchParams;
  const code=query.get('code')||'',state=query.get('state')||'';
  if(query.has('error')||!code||!state)return safePage(false);
  const clientId=Deno.env.get('GOOGLE_CLIENT_ID')||'';
  const clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')||'';
  if(!clientId||!clientSecret)return safePage(false);
  let stateData:{staffId:string;exp:number;nonce:string};
  try{stateData=await readState(state,clientSecret);}catch{return safePage(false);}
  const lookup=await db.from('pastoral_staff').select('id,role,is_active').eq('id',stateData.staffId).maybeSingle();
  if(lookup.error||!lookup.data?.is_active||(lookup.data.role!=='pastor'&&lookup.data.role!=='admin'))return safePage(false);
  const access=await db.from('pastoral_staff_access').select('entity_key').eq('staff_id',stateData.staffId).eq('entity_key','mplus').maybeSingle();
  if(access.error||!access.data)return safePage(false);
  let tokenResponse:Response;
  try{
    tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri(),grant_type:'authorization_code'})});
  }catch{return safePage(false);}
  if(!tokenResponse.ok)return safePage(false);
  const tokens=await tokenResponse.json();
  if(typeof tokens.refresh_token!=='string'||tokens.refresh_token.length>8192||typeof tokens.access_token!=='string')return safePage(false);
  const granted=new Set(String(tokens.scope||'').split(' '));
  const requiredCalendarScopes=CALENDAR_SCOPES.filter(scope=>scope.startsWith('https://www.googleapis.com/auth/calendar.'));
  if(typeof tokens.scope==='string'&&!requiredCalendarScopes.every(scope=>granted.has(scope)))return safePage(false);
  let profileResponse:Response;
  try{profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${tokens.access_token}`},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{return safePage(false);}
  if(!profileResponse.ok)return safePage(false);
  const profile=await profileResponse.json();
  if(profile.email!==CALENDAR_EMAIL||profile.email_verified!==true)return safePage(false);
  try{await storeRefreshToken(db,tokens.refresh_token);}catch{return safePage(false);}
  return Response.redirect(`${APP_ORIGIN}/pastoral/workspace.html?calendar=connected`,303);
}
async function scheduleTarget(db:ReturnType<typeof adminClient>,actor:Staff,requested:unknown){
  const staffId=typeof requested==='string'?requested:actor.id;
  const result=await db.from('pastoral_staff').select('id,is_active').eq('id',staffId).eq('is_active',true).maybeSingle();
  if(result.error)throw new Error('db');
  if(!result.data)return null;
  const access=await db.from('pastoral_staff_access').select('staff_id').eq('staff_id',staffId).eq('entity_key','mplus').maybeSingle();
  if(access.error)throw new Error('db');
  return access.data?staffId:null;
}
async function schedulePreferences(db:ReturnType<typeof adminClient>,staffId:string){
  const result=await db.from('pastoral_staff_schedule_preferences')
    .select('rest_days,work_start,work_end,allow_emergency_override')
    .eq('staff_id',staffId).maybeSingle();
  if(result.error)throw new Error('db');
  const row=result.data;
  return row ? {
    restDays:row.rest_days,
    workStart:String(row.work_start).slice(0,5),
    workEnd:String(row.work_end).slice(0,5),
    allowEmergencyOverride:row.allow_emergency_override,
  } : {};
}
async function saveSchedulePreferences(db:ReturnType<typeof adminClient>,staff:Staff,body:Record<string,unknown>){
  const requestedStaffId=typeof body.staffId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.staffId)?body.staffId:staff.id;
  const canManageSchedule=staff.role==='pastor'||staff.role==='admin';
  if(!canManageSchedule&&requestedStaffId!==staff.id)return json(APP_ORIGIN,{ok:false,error:'pastor_required'},403);
  const staffId=requestedStaffId;
  const restDays=body.restDays;
  const workStart=body.workStart,workEnd=body.workEnd;
  const allowEmergencyOverride=body.allowEmergencyOverride;
  const validClock=(value:unknown)=>typeof value==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
  if(!Array.isArray(restDays)||restDays.some(day=>!Number.isInteger(day)||day<0||day>6)||
    !validClock(workStart)||!validClock(workEnd)||workStart>=workEnd||typeof allowEmergencyOverride!=='boolean')
    return json(APP_ORIGIN,{ok:false,error:'invalid_schedule_preferences'},400);
  const target=await db.from('pastoral_staff').select('id,is_active').eq('id',staffId).eq('is_active',true).maybeSingle();
  if(target.error)throw new Error('db');
  if(!target.data)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},404);
  const targetAccess=await db.from('pastoral_staff_access').select('staff_id').eq('staff_id',staffId).eq('entity_key','mplus').maybeSingle();
  if(targetAccess.error)throw new Error('db');
  if(!targetAccess.data)return json(APP_ORIGIN,{ok:false,error:'mplus_access_required'},403);
  const write=await db.from('pastoral_staff_schedule_preferences').upsert({
    staff_id:staffId,rest_days:[...new Set(restDays)].sort((a,b)=>a-b),
    work_start:workStart,work_end:workEnd,timezone:'Asia/Taipei',
    allow_emergency_override:allowEmergencyOverride,updated_at:new Date().toISOString(),
  },{onConflict:'staff_id'});
  if(write.error)throw new Error('db');
  return json(APP_ORIGIN,{ok:true});
}

function parseRfc3339(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new Error('invalid_time');
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))throw new Error('invalid_time');
  return ms;
}

function readAppointment(body:Record<string,unknown>){
  if(typeof body.summary!=='string'||!body.summary.trim()||body.summary.trim().length>200)return null;
  if(body.location!==undefined&&typeof body.location!=='string')return null;
  const location=typeof body.location==='string'?body.location.trim():'';
  if(location.length>500)return null;
  let start:number,end:number;
  try{start=parseRfc3339(body.start);end=parseRfc3339(body.end);}catch{return null;}
  if(end<=start||end-start>120*60*1000||!MEETING_MINUTES.includes((end-start)/60000))return null;
  if(body.emergency!==undefined&&typeof body.emergency!=='boolean')return null;
  return {summary:body.summary.trim(),location,start,end,emergency:body.emergency===true};
}

async function accessToken(db:ReturnType<typeof adminClient>){
  const refreshToken=await getRefreshToken(db);
  if(!refreshToken)return null;
  const clientId=Deno.env.get('GOOGLE_CLIENT_ID')||'',clientSecret=Deno.env.get('GOOGLE_CLIENT_SECRET')||'';
  let response:Response;
  try{response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});}catch{return null;}
  if(!response.ok)return null;
  const data=await response.json();
  return typeof data.access_token==='string'?data.access_token:null;
}
async function freeBusy(token:string,start:string,end:string){
  const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,timeZone:'Asia/Taipei',items:[{id:CALENDAR_ID}]})});
  if(!response.ok)throw new Error('calendar_api');
  const data=await response.json(),calendar=data.calendars?.[CALENDAR_ID];
  if(!calendar||calendar.errors||!Array.isArray(calendar.busy))throw new Error('calendar_api');
  return calendar.busy as Array<{start:string;end:string}>;
}

async function eventAlreadyCreated(token:string,requestId:string,eventId:string,appointment:{summary:string;location:string;start:number;end:number},participants:Array<{id:string;display_name:string;line_subject:string|null}>){
  const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(response.status===404)return false;
  if(!response.ok)throw new Error('calendar_api');
  const event=await response.json();
  const privateProps=event.extendedProperties?.private||{};
  return privateProps.pastoralRequestId===requestId&&privateProps.pastoralParticipantIds===[...participants].map(person=>person.id).sort().join(',')&&event.summary===appointment.summary&&(event.location||'')===appointment.location&&Date.parse(event.start?.dateTime||'')===appointment.start&&Date.parse(event.end?.dateTime||'')===appointment.end;
}
async function createCalendarEvent(token:string,requestId:string,appointment:{summary:string;location:string;start:number;end:number},participants:Array<{id:string;display_name:string;line_subject:string|null}>){
  const eventId=requestId.toLowerCase().replaceAll('-','');
  const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  if(await eventAlreadyCreated(token,requestId,eventId,appointment,participants))return {created:false,conflict:false};
  const busy=await freeBusy(token,new Date(appointment.start-BUFFER_MS).toISOString(),new Date(appointment.end+BUFFER_MS).toISOString());
  if(busy.length)return {created:false,conflict:true};
  const event={id:eventId,summary:appointment.summary,...(appointment.location?{location:appointment.location}:{}),
    start:{dateTime:new Date(appointment.start).toISOString(),timeZone:'Asia/Taipei'},
    end:{dateTime:new Date(appointment.end).toISOString(),timeZone:'Asia/Taipei'},
    description:`共同參與同工：${participants.map(person=>person.display_name).join('、')}`,
    extendedProperties:{private:{pastoralRequestId:requestId,pastoralParticipantIds:participants.map(person=>person.id).sort().join(',')}}};
  const response=await fetch(`${base}?sendUpdates=none`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(event)});
  if(response.status===409){
    if(await eventAlreadyCreated(token,requestId,eventId,appointment,participants))return {created:false,conflict:false};
    return {created:false,conflict:true};
  }
  if(!response.ok)throw new Error('calendar_api');
  return {created:true,conflict:false};
}


function validCalendarDate(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split('-').map(Number);
  const check=new Date(Date.UTC(year,month-1,day));
  return check.getUTCFullYear()===year&&check.getUTCMonth()+1===month&&check.getUTCDate()===day
    ?{year,month,day,weekday:check.getUTCDay()}:null;
}
function dateNumber(value:{year:number;month:number;day:number}){
  return Math.floor(Date.UTC(value.year,value.month-1,value.day)/86400000);
}
function dayString(value:{year:number;month:number;day:number}){
  return `${value.year}-${String(value.month).padStart(2,'0')}-${String(value.day).padStart(2,'0')}`;
}
function slotWindow(value:{year:number;month:number;day:number},clock:string){
  const [hour,minute]=clock.split(':').map(Number);
  return Date.UTC(value.year,value.month-1,value.day,hour,minute)-8*60*60*1000;
}
function localWeekday(value:number){
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',weekday:'short'}).format(new Date(value));
}

async function resolveMeetingParticipants(db:ReturnType<typeof adminClient>,primaryId:string,raw:unknown){
  if(raw!==undefined&&(!Array.isArray(raw)||raw.length>10||raw.some(id=>typeof id!=='string'||!UUID.test(id))))return null;
  const ids=[...new Set([primaryId,...(Array.isArray(raw)?raw as string[]:[])])];
  if(ids.length>10)return null;
  const access=await db.from('pastoral_staff_access').select('staff_id').eq('entity_key','mplus').in('staff_id',ids);
  if(access.error)throw new Error('db');
  if(new Set((access.data||[]).map((row:{staff_id:string})=>row.staff_id)).size!==ids.length)return null;
  const result=await db.from('pastoral_staff').select('id,display_name,line_subject,is_active').eq('is_active',true).in('id',ids);
  if(result.error)throw new Error('db');
  const people=result.data||[];
  return people.length===ids.length?ids.map(id=>people.find((person:{id:string})=>person.id===id)!):null;
}
async function sendCoworkerPush(db:ReturnType<typeof adminClient>,recipient:{id:string;display_name:string;line_subject:string|null},
  notificationType:string,relatedId:string,message:string){
  const key=`${notificationType}:${relatedId}:${recipient.id}`;
  const previous=await db.from('pastoral_notification_deliveries').select('status').eq('idempotency_key',key).maybeSingle();
  if(previous.error)throw new Error('db');
  if(previous.data?.status==='sent')return 'sent';
  let status='failed',errorCode:string|null=null;
  const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
  if(!token){status='not_configured';errorCode='channel_token_missing';}
  else if(!/^U[0-9a-f]{32}$/i.test(recipient.line_subject||'')){status='failed';errorCode='line_identity_missing';}
  else{
    try{
      const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({to:recipient.line_subject,messages:[{type:'text',text:message}]})});
      if(response.ok)status='sent';else errorCode=`line_http_${response.status}`;
    }catch{errorCode='line_unavailable';}
  }
  const save=await db.from('pastoral_notification_deliveries').upsert({
    entity_key:'mplus',notification_type:notificationType,recipient_staff_id:recipient.id,related_id:relatedId,
    idempotency_key:key,status,error_code:errorCode,sent_at:status==='sent'?new Date().toISOString():null,
    updated_at:new Date().toISOString(),
  },{onConflict:'idempotency_key'});
  if(save.error)throw new Error('db');
  return status;
}
async function notifyMeetingParticipants(db:ReturnType<typeof adminClient>,people:Array<{id:string;display_name:string;line_subject:string|null}>,
  requestId:string,appointment:{summary:string;location:string;start:number;end:number}){
  const date=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(appointment.start));
  const link='https://liff.line.me/2011645391-VgkQRZ9d/workspace.html?tab=calendar';
  const results=await Promise.all(people.map(person=>sendCoworkerPush(db,person,'calendar_participant',requestId,
    `M+ 同工行程通知：${appointment.summary}\n時間：${date}\n地點：${appointment.location||'未指定'}\n共同參與：${people.map(item=>item.display_name).join('、')}\n開啟同工工作台：${link}`)));
  return {sent:results.filter(status=>status==='sent').length,total:people.length,
    status:results.every(status=>status==='sent')?'sent':results.some(status=>status==='sent')?'partial':results.includes('not_configured')?'not_configured':'failed'};
}

async function findAvailableSlots(db:ReturnType<typeof adminClient>,staff:Staff,body:Record<string,unknown>){
  const from=validCalendarDate(body.dateFrom),through=validCalendarDate(body.dateThrough);
  const duration=body.durationMinutes;
  if(!from||!through||!MEETING_MINUTES.includes(duration as number))
    return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
  const dayCount=dateNumber(through)-dateNumber(from)+1;
  if(dayCount<1||dayCount>31)return json(APP_ORIGIN,{ok:false,error:'invalid_window'},400);
  const targetStaffId=await scheduleTarget(db,staff,body.staffId);
  if(!targetStaffId)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},403);
  const participants=await resolveMeetingParticipants(db,targetStaffId,body.participantIds);
  if(!participants)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},400);
  const participantPreferences=await Promise.all(participants.map(person=>schedulePreferences(db,person.id)));
  const preferences=participantPreferences[0]||{};
  const restDays=Array.isArray(preferences.restDays)?preferences.restDays:[];
  const workStart=preferences.workStart||DEFAULT_WORK_START;
  const workEnd=preferences.workEnd||DEFAULT_WORK_END;
  const start=slotWindow(from,'00:00');
  const afterThrough=slotWindow({year:new Date(Date.UTC(through.year,through.month-1,through.day+1)).getUTCFullYear(),
    month:new Date(Date.UTC(through.year,through.month-1,through.day+1)).getUTCMonth()+1,
    day:new Date(Date.UTC(through.year,through.month-1,through.day+1)).getUTCDate()},'00:00');
  const now=Date.now();
  if(afterThrough<=now)return json(APP_ORIGIN,{ok:true,slots:[]});
  const token=await accessToken(db);
  if(!token)return json(APP_ORIGIN,{ok:false,error:'calendar_not_connected'},503);
  try{
    const busy=await freeBusy(token,new Date(Math.max(start,now)).toISOString(),new Date(afterThrough).toISOString());
    const durationMs=(duration as number)*60000;
    const slots:Array<{date:string;time:string;start:string;end:string;label:string}>=[];
    for(let offset=0;offset<dayCount&&slots.length<12;offset++){
      const stamp=new Date(Date.UTC(from.year,from.month-1,from.day+offset));
      const date={year:stamp.getUTCFullYear(),month:stamp.getUTCMonth()+1,day:stamp.getUTCDate(),weekday:stamp.getUTCDay()};
      if(!DEFAULT_WORK_DAYS.includes(date.weekday))continue;
      const dayStart=Math.max(slotWindow(date,workStart),start,now);
      const dayEnd=Math.min(slotWindow(date,workEnd),afterThrough);
      const halfHour=30*60000;
      const firstCandidate=Math.ceil(dayStart/halfHour)*halfHour;
      let daySlots=0;
      for(let candidate=firstCandidate;candidate+durationMs<=dayEnd&&slots.length<12&&daySlots<3;candidate+=halfHour){
        const slotEnd=candidate+durationMs;
        if(participantPreferences.some(person=>scheduleError(candidate,slotEnd,false,person)!==null))continue;
        const bufferedStart=candidate-BUFFER_MS,bufferedEnd=slotEnd+BUFFER_MS;
        if(busy.some(item=>Date.parse(item.start)<bufferedEnd&&Date.parse(item.end)>bufferedStart))continue;
        const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(candidate));
        daySlots++;
        slots.push({date:dayString(date),time,start:new Date(candidate).toISOString(),end:new Date(candidate+durationMs).toISOString(),
          label:`${localWeekday(candidate)} ${date.month}/${date.day} ${time}`});
      }
    }
    return json(APP_ORIGIN,{ok:true,slots});
  }catch{return json(APP_ORIGIN,{ok:false,error:'calendar_unavailable'},503);}
}

async function handleAction(request:Request,db:ReturnType<typeof adminClient>,staff:Staff){
  if(!staff.entityKeys.includes('mplus'))return json(APP_ORIGIN,{ok:false,error:'mplus_access_required'},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.action!=='string')return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
  if(body.action==='connect')return await startConnect(staff,db);
  if(body.action==='list-schedule-staff'){
    const canManageSchedule=staff.role==='pastor'||staff.role==='admin';
    const access=await db.from('pastoral_staff_access').select('staff_id').eq('entity_key','mplus');
    if(access.error)throw new Error('db');
    const staffIds=[...new Set((access.data||[]).map((row:{staff_id:string})=>row.staff_id))];
    if(!staffIds.length)return json(APP_ORIGIN,{ok:true,staff:[]});
    const result=await db.from('pastoral_staff').select('id,display_name,role,is_active').eq('is_active',true).in('id',staffIds).order('display_name');
    if(result.error)throw new Error('db');
    const rows=result.data||[];
    const prefs=rows.length?await db.from('pastoral_staff_schedule_preferences').select('staff_id,rest_days,work_start,work_end,allow_emergency_override').in('staff_id',rows.map((row:{id:string})=>row.id)):{data:[],error:null};
    if(prefs.error)throw new Error('db');
    const byId=new Map((prefs.data||[]).map((row:{staff_id:string;rest_days:number[];work_start:string;work_end:string;allow_emergency_override:boolean})=>[row.staff_id,row]));
    return json(APP_ORIGIN,{ok:true,staff:rows.map((row:{id:string;display_name:string;role:string})=>{
      const pref=byId.get(row.id);
      const mayView=canManageSchedule||row.id===staff.id;
      return {id:row.id,name:row.display_name,role:row.role,isSelf:row.id===staff.id,
        restDays:mayView?(pref?.rest_days||[]):[],workStart:mayView?String(pref?.work_start||'09:00').slice(0,5):'09:00',
        workEnd:mayView?String(pref?.work_end||'17:00').slice(0,5):'17:00',
        allowEmergencyOverride:mayView?(pref?.allow_emergency_override??true):true};
    })});
  }
  if(body.action==='save-schedule-preferences')return await saveSchedulePreferences(db,staff,body);
  if(body.action==='schedule-preferences'){
    const preferences=await schedulePreferences(db,staff.id);
    return json(APP_ORIGIN,{ok:true,preferences:{
      restDays:preferences.restDays||[],workStart:preferences.workStart||'09:00',workEnd:preferences.workEnd||'17:00',
      allowEmergencyOverride:preferences.allowEmergencyOverride??true
    }});
  }
  if(body.action==='status'){
    const token=await getRefreshToken(db).catch(()=>null);
    return json(APP_ORIGIN,{ok:true,connected:!!token,calendarId:CALENDAR_ID,accountEmail:token?CALENDAR_EMAIL:null});
  }
  if(body.action==='find-available-slots')return await findAvailableSlots(db,staff,body);
  if(body.action==='freebusy'){
    let start:number,end:number;
    try{start=parseRfc3339(body.timeMin);end=parseRfc3339(body.timeMax);}catch{return json(APP_ORIGIN,{ok:false,error:'invalid_time'},400);}
    if(end<=start||end-start>31*86400000)return json(APP_ORIGIN,{ok:false,error:'invalid_window'},400);
    const token=await accessToken(db);
    if(!token)return json(APP_ORIGIN,{ok:false,error:'calendar_not_connected'},503);
    try{
      const busy=await freeBusy(token,new Date(start).toISOString(),new Date(end).toISOString());
      return json(APP_ORIGIN,{ok:true,busy});
    }catch{return json(APP_ORIGIN,{ok:false,error:'calendar_unavailable'},503);}
  }
  if(body.action==='check-availability'){
    const appointment=readAppointment(body);
    if(!appointment)return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
    const targetStaffId=await scheduleTarget(db,staff,body.staffId);
    if(!targetStaffId)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},403);
    const participants=await resolveMeetingParticipants(db,targetStaffId,body.participantIds);
    if(!participants)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},400);
    for(const person of participants){
      const policy=scheduleError(appointment.start,appointment.end,appointment.emergency,await schedulePreferences(db,person.id));
      if(policy)return json(APP_ORIGIN,{ok:false,error:policy},409);
    }
    const token=await accessToken(db);
    if(!token)return json(APP_ORIGIN,{ok:false,error:'calendar_not_connected'},503);
    try{
      const busy=await freeBusy(token,new Date(appointment.start-BUFFER_MS).toISOString(),new Date(appointment.end+BUFFER_MS).toISOString());
      return json(APP_ORIGIN,{ok:true,available:busy.length===0});
    }catch{return json(APP_ORIGIN,{ok:false,error:'calendar_unavailable'},503);}
  }
  if(body.action==='create-event'){
    if(body.confirmed!==true)return json(APP_ORIGIN,{ok:false,error:'confirmation_required'},400);
    const appointment=readAppointment(body);
    if(!appointment||typeof body.requestId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
    const targetStaffId=await scheduleTarget(db,staff,body.staffId);
    if(!targetStaffId)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},403);
    const participants=await resolveMeetingParticipants(db,targetStaffId,body.participantIds);
    if(!participants)return json(APP_ORIGIN,{ok:false,error:'invalid_staff'},400);
    for(const person of participants){
      const policy=scheduleError(appointment.start,appointment.end,appointment.emergency,await schedulePreferences(db,person.id));
      if(policy)return json(APP_ORIGIN,{ok:false,error:policy},409);
    }
    const token=await accessToken(db);
    if(!token)return json(APP_ORIGIN,{ok:false,error:'calendar_not_connected'},503);
    try{
      const result=await createCalendarEvent(token,body.requestId,appointment,participants);
      if(result.conflict)return json(APP_ORIGIN,{ok:false,error:'calendar_conflict'},409);
      const notifications=await notifyMeetingParticipants(db,participants,body.requestId,appointment);
      return json(APP_ORIGIN,{ok:true,created:result.created,calendarId:CALENDAR_ID,notifications});
    }catch{return json(APP_ORIGIN,{ok:false,error:'calendar_unavailable'},503);}
  }
  return json(APP_ORIGIN,{ok:false,error:'invalid_action'},400);
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(request.method==='GET'){
    try{return await callback(request,adminClient());}catch{return safePage(false);}
  }
  if(request.method!=='POST'||origin!==APP_ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);
  let db:ReturnType<typeof adminClient>;
  try{db=adminClient();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  const staff=await staffFromRequest(request,db).catch(()=>null);
  if(!staff)return json(origin,{ok:false,error:'login_required'},401);
  try{return await handleAction(request,db,staff);}catch{return json(origin,{ok:false,error:'unavailable'},503);}
});
