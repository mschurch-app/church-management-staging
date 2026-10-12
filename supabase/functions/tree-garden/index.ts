import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {emptyState,refreshState,applyCommand,dayNow,validDay,festival} from './engine.ts';
const origins=new Set(['https://mscos.mchurch.online','http://127.0.0.1:4180','http://localhost:4180']);
const channel=Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391';
const headers=(origin:string)=>({'access-control-allow-origin':origins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json;charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'});
const reply=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
async function identity(token:unknown){
 if(typeof token!=='string'||!token||token.length>8192)return null;
 const r=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:channel})});
 if(!r.ok)return null;const c=await r.json(),now=Math.floor(Date.now()/1000);
 return c.iss==='https://access.line.me'&&c.aud===channel&&Number.isSafeInteger(c.exp)&&c.exp>now&&Number.isSafeInteger(c.iat)&&c.iat<=now+60&&/^U[0-9a-f]{32}$/.test(c.sub)?c.sub:null;
}
async function importLegacy(s:any,token:string,origin:string,today:string){
 if(s.legacyImported)return;
 try{
 const r=await fetch('https://svwgfgyxxgbqabosriom.supabase.co/functions/v1/tree-reading-october-test',{method:'POST',signal:AbortSignal.timeout(12000),headers:{origin,authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{"action":"me"}'});
 const old=await r.json();if(r.status===404&&old.error==='join_required'){s.legacyImported=true;return;}
 if(!r.ok||old.ok!==true)return;
 if(validDay(old.participant?.reading_start_date))s.startDate=[s.startDate,old.participant.reading_start_date].sort()[0];
 for(const row of old.records||[])if(validDay(row.reading_date)&&row.reading_date>=s.startDate&&row.reading_date<=today&&['on_time','makeup'].includes(row.completion_type)&&!s.records.some((v:any)=>v.reading_date===row.reading_date))s.records.push({...row,boosted:false});
 for(const row of old.notes||[])if(s.records.some((v:any)=>v.reading_date===row.reading_date)&&typeof row.note==='string'&&!s.notes.some((v:any)=>v.reading_date===row.reading_date))s.notes.push({reading_date:row.reading_date,note:row.note.slice(0,500)});
 s.legacyImported=true;
 }catch{/* Retry on a later visit; never turn a network failure into an empty history. */}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return origins.has(origin)?new Response('ok',{headers:headers(origin)}):reply(origin,{ok:false,error:'forbidden'},403);
 if(req.method!=='POST'||!origins.has(origin))return reply(origin,{ok:false,error:'forbidden'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>16384)return reply(origin,{ok:false,error:'invalid_request'},400);
  const raw=await req.text();if(raw.length>16384)return reply(origin,{ok:false,error:'invalid_request'},400);
  const body=JSON.parse(raw),token=body.idToken||req.headers.get('authorization')?.replace(/^Bearer /i,'');
  const subject=await identity(token);if(!subject)return reply(origin,{ok:false,error:'login_required'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
  const args={p_channel:channel,p_subject:subject};
  let context=await db.rpc('tree_garden_context',args);if(context.error)throw Error(context.error.message.includes('binding_required')?'binding_required':'unavailable');
  const today=dayNow();let person=context.data;
  if(!person.state){const created=await db.from('tree_garden_states').upsert({member_id:person.member_id,state:emptyState(today)},{onConflict:'member_id',ignoreDuplicates:true});if(created.error)throw Error('unavailable');context=await db.rpc('tree_garden_context',args);if(context.error)throw Error('unavailable');person=context.data;}
  // Team actions also need a current-day encounter after midnight.
  if(!person.state.encounters[today]){
   const s=refreshState(structuredClone(person.state),today,festival(today,person.birthday_today));
   const saved=await db.rpc('tree_garden_save',{p_member:person.member_id,p_version:person.version,p_state:s});
   if(saved.error)throw Error('unavailable');if(!saved.data)return reply(origin,{ok:false,error:'conflict'},409);
   context=await db.rpc('tree_garden_context',args);if(context.error)throw Error('unavailable');person=context.data;
  }
  let team=null,plan=null;const action=body.action||'me';
  if(action==='plan'||action==='read'&&(body.day||today)>='2027-01-01'){
   const day=body.day||today;if(!validDay(day)||day>today)throw Error('date_not_allowed');
   const r=await db.from('daily_devotionals').select('devotional_title,roots_reading,branches_reading,fruit_reading').eq('church_id','M+').eq('devotional_date',day).eq('review_status','approved').lte('published_at',new Date().toISOString()).maybeSingle();
   if(r.error)throw Error('unavailable');if(!r.data)throw Error('content_empty');
   plan={title:r.data.devotional_title,passage:`🌳 根｜${r.data.roots_reading||'—'}　🌿 枝｜${r.data.branches_reading||'—'}　🍎 果｜${r.data.fruit_reading||'—'}`};
  }
  if(['team','invite','join','leave'].includes(action)){
   const token=body.token||null;if(token!==null&&!/^[0-9a-f-]{36}$/.test(token))throw Error('invite_invalid');
   const r=await db.rpc('tree_garden_team',{...args,p_action:action,p_token:token});if(r.error)throw Error(['group_required','invite_invalid'].find(v=>r.error.message.includes(v))||'unavailable');team=r.data;
  }else if(action==='care'){
   if(!/^[0-9a-f-]{36}$/.test(body.recipient||'')||!/^[0-9a-f-]{36}$/.test(body.requestId||'')||typeof body.message!=='string'||body.message.length>120)throw Error('invalid_action');
   const r=await db.rpc('tree_garden_send_care',{...args,p_recipient:body.recipient,p_request:body.requestId,p_message:body.message});if(r.error)throw Error(['care_limit','care_forbidden','invalid_message'].find(v=>r.error.message.includes(v))||'unavailable');
   const t=await db.rpc('tree_garden_team',{...args,p_action:'team'});if(t.error)throw Error('unavailable');team=t.data;
  }else if(action!=='plan'){
   const s=structuredClone(person.state),theme=festival(today,person.birthday_today);
   if(action==='me')await importLegacy(s,token,origin,today);
   refreshState(s,today,theme);
   if(action!=='me'){
    if(!/^[0-9a-f-]{36}$/.test(body.requestId||''))throw Error('invalid_request');
    if(!s.receipts.includes(body.requestId)){applyCommand(s,action,body,today);s.receipts=[...s.receipts.slice(-63),body.requestId];}
   }
   refreshState(s,today,theme);
   if(JSON.stringify(s)!==JSON.stringify(person.state)){
    const saved=await db.rpc('tree_garden_save',{p_member:person.member_id,p_version:person.version,p_state:s});if(saved.error)throw Error('unavailable');if(!saved.data)return reply(origin,{ok:false,error:'conflict'},409);
   }
  }
  context=await db.rpc('tree_garden_context',args);if(context.error)throw Error('unavailable');person=context.data;
  return reply(origin,{ok:true,state:person.state,version:person.version,today,profile:{name:person.name,group_name:person.group_name,team_enabled:person.team_enabled,birthday_today:person.birthday_today},theme:festival(today,person.birthday_today),team,plan});
 }catch(e){const known=['binding_required','invalid_action','invalid_request','wrong_gear','stale_event','item_unavailable','already_full','rest_needed','mp_needed','date_not_allowed','read_first','invalid_note','group_required','invite_invalid','care_limit','care_forbidden','content_empty'];const message=e instanceof Error?e.message:'';return reply(origin,{ok:false,error:known.includes(message)?message:'unavailable'},known.includes(message)?400:503);}
});
