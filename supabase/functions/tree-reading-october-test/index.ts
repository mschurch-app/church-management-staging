import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Body={action?:unknown;inviteCode?:unknown;readingDate?:unknown;challengeId?:unknown;resolutionAction?:unknown;note?:unknown};
const START='2026-10-01',END='2026-10-31';
const CHALLENGES=['worm','wind','typhoon','trouble'] as const;
const SOLUTIONS:Record<string,string>={worm:'pest',wind:'support',typhoon:'guard',trouble:'repair'};
const origins=new Set((Deno.env.get('TREE_READING_TEST_ALLOWED_ORIGINS')||'https://mscos.mchurch.online,http://127.0.0.1:4180,http://localhost:4180').split(',').map(v=>v.trim()).filter(Boolean));
const cors=(origin:string)=>({'access-control-allow-origin':origins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','pragma':'no-cache','vary':'Origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
const reply=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
const todayTaipei=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
// Calendar arithmetic must be independent of the Edge Runtime's local timezone.
const shiftDate=(date:string,days:number)=>{const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);};
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^2026-10-(0[1-9]|[12][0-9]|3[01])$/.test(value);
const expectedCount=(start:string,today:string)=>today<start?0:Math.floor((Date.parse(`${today}T12:00:00Z`)-Date.parse(`${start}T12:00:00Z`))/86400000)+1;

async function verifyLine(token:string){
  const channel=Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391';
  if(!token||token.length>8192)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:channel})});
    if(!response.ok)return null;
    const claims=await response.json(),now=Math.floor(Date.now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==channel||!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||!/^U[0-9a-f]{32}$/.test(claims.sub))return null;
    return {subject:claims.sub,name:typeof claims.name==='string'?claims.name.trim().slice(0,60):''};
  }catch{return null;}
}

async function recordsFor(db:ReturnType<typeof createClient>,subject:string){
  const response=await db.from('tree_reading_october_test_progress').select('reading_date,completion_type,completed_at,watered_at').eq('line_subject',subject).order('reading_date');
  if(response.error)throw new Error('unavailable');
  return response.data||[];
}

async function dailyChallenges(db:ReturnType<typeof createClient>,today:string){
  if(!validDate(today))return;
  const people=await db.from('tree_reading_october_test_participants').select('line_subject');
  if(people.error)throw new Error('unavailable');
  const chosen=[];
  for(const person of people.data||[]){
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${today}|${person.line_subject}`)));
    if(digest[0]>=26)continue;
    chosen.push({line_subject:person.line_subject,challenge_date:today,challenge_type:CHALLENGES[digest[1]%CHALLENGES.length]});
  }
  if(chosen.length){
    const inserted=await db.from('tree_reading_october_test_challenges').upsert(chosen,{onConflict:'line_subject,challenge_date',ignoreDuplicates:true});
    if(inserted.error)throw new Error('unavailable');
  }
}

async function challengesFor(db:ReturnType<typeof createClient>,subject:string){
  const response=await db.from('tree_reading_october_test_challenges').select('id,challenge_date,challenge_type,status,resolution_action,resolved_at').eq('line_subject',subject).order('challenge_date');
  if(response.error)throw new Error('unavailable');
  return response.data||[];
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origins.has(origin)?new Response('ok',{headers:cors(origin)}):reply(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||!origins.has(origin))return reply(origin,{ok:false,error:'forbidden'},403);
  const bearer=request.headers.get('authorization')||'',match=bearer.match(/^Bearer ([^\s]+)$/i);
  if(!match)return reply(origin,{ok:false,error:'login_required'},401);
  const identity=await verifyLine(match[1]);
  if(!identity)return reply(origin,{ok:false,error:'login_required'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',secret=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!secret)return reply(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let body:Body;
  try{body=await request.json();}catch{return reply(origin,{ok:false,error:'invalid_request'},400);}
  const action=typeof body.action==='string'?body.action:'';
  const today=todayTaipei();

  try{
    if(action==='join'){
      if(today>END)return reply(origin,{ok:false,error:'test_closed'},403);
      if(typeof body.inviteCode!=='string'||body.inviteCode.trim().length<10||body.inviteCode.length>64)return reply(origin,{ok:false,error:'invite_invalid'},403);
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.inviteCode.trim().toUpperCase())));
      const codeHash=[...digest].map(value=>value.toString(16).padStart(2,'0')).join('');
      const invitation=await db.from('tree_reading_october_test_invites').select('access_level,active').eq('code_hash',codeHash).maybeSingle();
      if(invitation.error||!invitation.data?.active)return reply(origin,{ok:false,error:'invite_invalid'},403);
      const existing=await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date,joined_at,is_admin').eq('line_subject',identity.subject).maybeSingle();
      if(existing.error)return reply(origin,{ok:false,error:'unavailable'},503);
      let participant=existing.data;
      if(!participant){
        const start=today<START?START:today;
        const inserted=await db.from('tree_reading_october_test_participants').insert({line_subject:identity.subject,display_name:identity.name||`同工 ${identity.subject.slice(-4)}`,reading_start_date:start,is_admin:invitation.data.access_level==='admin'}).select('line_subject,display_name,reading_start_date,joined_at,is_admin').single();
        if(inserted.error&&inserted.error.code!=='23505')return reply(origin,{ok:false,error:'unavailable'},503);
        participant=inserted.data||(await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date,joined_at,is_admin').eq('line_subject',identity.subject).single()).data;
      }else if(invitation.data.access_level==='admin'&&!participant.is_admin){
        const elevated=await db.from('tree_reading_october_test_participants').update({is_admin:true}).eq('line_subject',identity.subject).select('line_subject,display_name,reading_start_date,joined_at,is_admin').single();
        if(elevated.error)return reply(origin,{ok:false,error:'unavailable'},503);
        participant=elevated.data;
      }
      await dailyChallenges(db,today);
      const records=await recordsFor(db,identity.subject);
      return reply(origin,{ok:true,participant,records,challenges:await challengesFor(db,identity.subject),is_admin:Boolean(participant?.is_admin)});
    }

    const lookup=await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date,joined_at,is_admin').eq('line_subject',identity.subject).maybeSingle();
    if(lookup.error)return reply(origin,{ok:false,error:'unavailable'},503);
    if(!lookup.data)return reply(origin,{ok:false,error:'join_required'},404);
    const participant=lookup.data;
    if(action==='me'){
      await dailyChallenges(db,today);
      const notes=await db.from('tree_reading_october_test_journal').select('reading_date,note,passage,saved_at').eq('line_subject',identity.subject).order('reading_date');
      if(notes.error)return reply(origin,{ok:false,error:'unavailable'},503);
      return reply(origin,{ok:true,participant,records:await recordsFor(db,identity.subject),challenges:await challengesFor(db,identity.subject),notes:notes.data||[],is_admin:Boolean(participant.is_admin)});
    }
    if(action==='mark_read'){
      if(!validDate(body.readingDate)||body.readingDate>today||body.readingDate<participant.reading_start_date||(body.readingDate!==today&&body.readingDate<shiftDate(today,-7)))return reply(origin,{ok:false,error:'date_not_allowed'},400);
      const completion_type=body.readingDate===today?'on_time':'makeup';
      const inserted=await db.from('tree_reading_october_test_progress').insert({line_subject:identity.subject,reading_date:body.readingDate,completion_type});
      if(inserted.error&&inserted.error.code!=='23505')return reply(origin,{ok:false,error:'unavailable'},503);
      return reply(origin,{ok:true,completion_type,records:await recordsFor(db,identity.subject)});
    }
    if(action==='water_tree'){
      const readingDate=body.readingDate||today;
      if(!validDate(readingDate)||readingDate>today||readingDate<participant.reading_start_date||(readingDate!==today&&readingDate<shiftDate(today,-7)))return reply(origin,{ok:false,error:'date_not_allowed'},400);
      const watered=await db.from('tree_reading_october_test_progress').update({watered_at:new Date().toISOString()}).eq('line_subject',identity.subject).eq('reading_date',readingDate).is('watered_at',null).select('reading_date').maybeSingle();
      if(watered.error)return reply(origin,{ok:false,error:'unavailable'},503);
      if(!watered.data){
        const existing=await db.from('tree_reading_october_test_progress').select('watered_at').eq('line_subject',identity.subject).eq('reading_date',readingDate).maybeSingle();
        if(existing.error||!existing.data)return reply(origin,{ok:false,error:'read_first'},400);
      }
      return reply(origin,{ok:true,records:await recordsFor(db,identity.subject)});
    }
    if(action==='resolve_challenge'){
      const id=Number(body.challengeId),resolutionAction=typeof body.resolutionAction==='string'?body.resolutionAction:'';
      if(!Number.isSafeInteger(id))return reply(origin,{ok:false,error:'invalid_action'},400);
      const existing=await db.from('tree_reading_october_test_challenges').select('id,challenge_date,challenge_type,status').eq('id',id).eq('line_subject',identity.subject).maybeSingle();
      if(existing.error||!existing.data)return reply(origin,{ok:false,error:'challenge_not_found'},404);
      if(existing.data.challenge_date>today)return reply(origin,{ok:false,error:'challenge_not_started'},400);
      const expected=SOLUTIONS[existing.data.challenge_type];
      if(existing.data.status!=='active'||resolutionAction!==expected)return reply(origin,{ok:false,error:'resolution_invalid'},400);
      const resolved=await db.from('tree_reading_october_test_challenges').update({status:'resolved',resolution_action:resolutionAction,resolved_at:new Date().toISOString()}).eq('id',id).eq('line_subject',identity.subject).eq('status','active').select('id').maybeSingle();
      if(resolved.error||!resolved.data)return reply(origin,{ok:false,error:'unavailable'},503);
      return reply(origin,{ok:true,challenges:await challengesFor(db,identity.subject)});
    }
    if(action==='journal_save'){
      if(!validDate(body.readingDate)||body.readingDate>today||body.readingDate<participant.reading_start_date||typeof body.note!=='string'||body.note.trim().length<1||body.note.length>500)return reply(origin,{ok:false,error:'invalid_note'},400);
      const readRecord=await db.from('tree_reading_october_test_progress').select('reading_date').eq('line_subject',identity.subject).eq('reading_date',body.readingDate).maybeSingle();
      if(readRecord.error||!readRecord.data)return reply(origin,{ok:false,error:'read_first'},400);
      const passage=`箴言 ${Number(body.readingDate.slice(-2))} 章`;
      const saved=await db.from('tree_reading_october_test_journal').upsert({line_subject:identity.subject,reading_date:body.readingDate,note:body.note.trim(),passage,saved_at:new Date().toISOString()},{onConflict:'line_subject,reading_date'}).select('reading_date,note,passage,saved_at').single();
      if(saved.error)return reply(origin,{ok:false,error:'unavailable'},503);
      return reply(origin,{ok:true,note:saved.data});
    }
    if(action==='leaderboard'){
      const people=await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date').order('joined_at');
      const progress=await db.from('tree_reading_october_test_progress').select('line_subject,reading_date,completion_type');
      if(people.error||progress.error)return reply(origin,{ok:false,error:'unavailable'},503);
      const members=(people.data||[]).map(person=>({display_name:person.display_name,reading_start_date:person.reading_start_date,on_time_count:(progress.data||[]).filter(item=>item.line_subject===person.line_subject&&item.completion_type==='on_time').length,completed_count:(progress.data||[]).filter(item=>item.line_subject===person.line_subject).length})).sort((a,b)=>b.on_time_count-a.on_time_count||b.completed_count-a.completed_count||a.display_name.localeCompare(b.display_name,'zh-Hant')).slice(0,20);
      return reply(origin,{ok:true,members});
    }
    if(action==='garden'){
      const people=await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date').order('joined_at');
      const progress=await db.from('tree_reading_october_test_progress').select('line_subject,reading_date,completion_type');
      const events=await db.from('tree_reading_october_test_challenges').select('line_subject,status,challenge_type').lte('challenge_date',today);
      if(people.error||progress.error||events.error)return reply(origin,{ok:false,error:'unavailable'},503);
      // Staff test participants explicitly share display names and reading-day totals in the garden.
      // LINE subjects remain server-side and are never included in the response.
      const trees=(people.data||[]).map((person,index)=>({tree_number:index+1,display_name:person.display_name,completed_count:(progress.data||[]).filter(item=>item.line_subject===person.line_subject).length,on_time_count:(progress.data||[]).filter(item=>item.line_subject===person.line_subject&&item.completion_type==='on_time').length,challenge_active:(events.data||[]).some(item=>item.line_subject===person.line_subject&&item.status==='active'),reading_start_date:person.reading_start_date}));
      return reply(origin,{ok:true,trees});
    }
    if(action==='overview'){
      if(!participant.is_admin)return reply(origin,{ok:false,error:'staff_required'},403);
      await dailyChallenges(db,today);
      const people=await db.from('tree_reading_october_test_participants').select('line_subject,display_name,reading_start_date,joined_at').order('joined_at');
      if(people.error)return reply(origin,{ok:false,error:'unavailable'},503);
      const all=await db.from('tree_reading_october_test_progress').select('line_subject,reading_date');
      if(all.error)return reply(origin,{ok:false,error:'unavailable'},503);
      const events=await db.from('tree_reading_october_test_challenges').select('status').lte('challenge_date',today);
      if(events.error)return reply(origin,{ok:false,error:'unavailable'},503);
      const members=(people.data||[]).map(person=>({display_name:person.display_name,reading_start_date:person.reading_start_date,completed_count:(all.data||[]).filter(item=>item.line_subject===person.line_subject).length,expected_count:expectedCount(person.reading_start_date,today)}));
      return reply(origin,{ok:true,members,challenge_count:(events.data||[]).length,resolved_challenges:(events.data||[]).filter(item=>item.status==='resolved').length});
    }
    return reply(origin,{ok:false,error:'invalid_action'},400);
  }catch{return reply(origin,{ok:false,error:'unavailable'},503);}
});
