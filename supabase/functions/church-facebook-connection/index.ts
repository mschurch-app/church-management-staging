import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
const APP='https://mscos.mchurch.online',PAGE='171944699561868',TABLE='church_facebook_connections',enc=new TextEncoder();
const fail=(s:string):never=>{throw Error(s);};
const b64=(a:Uint8Array)=>btoa(Array.from(a,x=>String.fromCharCode(x)).join(''));
export function createHandler(db:any,serviceKey:string,fetcher:typeof fetch=fetch){return async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers={'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','vary':'Origin',...(origin===APP?{'access-control-allow-origin':APP}:{}),'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS'};
 const reply=(s:number,data:any)=>new Response(JSON.stringify(data),{status:s,headers});
 if(origin&&origin!==APP)return reply(403,{ok:false,error:'forbidden'});if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply(405,{ok:false,error:'invalid_method'});
 try{
  const raw=await req.text();if(raw.length>5000)fail('invalid_input');const b=JSON.parse(raw);if(b.church&&b.church!=='M+')fail('forbidden');
  let actor:string|null=null,hash:string|null=null;
  if(b.action==='connect_ticket'){
   if(typeof b.ticket!=='string'||!/^[a-f0-9]{64}$/.test(b.ticket))fail('forbidden');hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b.ticket))),x=>x.toString(16).padStart(2,'0')).join('');
   const t=await db.from('church_facebook_connection_tickets').select('created_by,expires_at,used_at').eq('ticket_hash',hash).maybeSingle();if(t.error||!t.data||t.data.used_at||Date.parse(t.data.expires_at)<=Date.now())fail('forbidden');actor=t.data.created_by;
  }else{
   const bearer=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!bearer)return reply(401,{ok:false,error:'login_required'});const u=await db.auth.getUser(bearer);if(u.error||!u.data.user)return reply(401,{ok:false,error:'login_required'});actor=u.data.user.id;
  }
  const permission=await db.rpc('get_weekly_bulletin_review_profile',{p_user:actor,p_church:'M+'});if(permission.error||permission.data?.reviewer!==true)fail('forbidden');
  if(b.action==='status'){
   const r=await db.from(TABLE).select('page_id,page_name,connected_at,last_verified_at').eq('church_id','M+').maybeSingle();if(r.error)fail('unavailable');return reply(200,{ok:true,connection:r.data?{...r.data,status:'connected'}:null});
  }
  if(!['connect','connect_ticket'].includes(b.action)||typeof b.pageToken!=='string'||b.pageToken.length<20||b.pageToken.length>2000)fail('invalid_input');
  const graph=async(path:string,fields:string)=>{const url=new URL('https://graph.facebook.com/v24.0/'+path);url.searchParams.set('fields',fields);url.searchParams.set('limit','1');const r=await fetcher(url,{headers:{authorization:'Bearer '+b.pageToken},redirect:'error',signal:AbortSignal.timeout(15000)}),data=await r.json().catch(()=>({}));if(!r.ok||data.error)fail('invalid_token');return data;};
  const me=await graph('me','id,name');if(String(me.id)!==PAGE)fail('channel_mismatch');await graph(PAGE+'/published_posts','id');
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(serviceKey+':church-facebook:v1')),key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(b.pageToken));
  if(hash){const r=await db.rpc('complete_church_facebook_connection',{p_hash:hash,p_name:String(me.name),p_ciphertext:b64(new Uint8Array(cipher)),p_iv:b64(iv)});if(r.error||r.data!==true)fail('forbidden');}
  else{const r=await db.from(TABLE).upsert({church_id:'M+',page_id:PAGE,page_name:String(me.name),token_ciphertext:b64(new Uint8Array(cipher)),token_iv:b64(iv),connected_by:actor,connected_at:new Date().toISOString(),last_verified_at:new Date().toISOString()});if(r.error)fail('unavailable');}
  return reply(200,{ok:true,encrypted:true,connection:{status:'connected',page_id:PAGE,page_name:String(me.name)}});
 }catch(e){const code=e instanceof Error?e.message:'';return reply(code==='forbidden'?403:400,{ok:false,error:['forbidden','invalid_input','invalid_token','channel_mismatch'].includes(code)?code:'unavailable'});}
};}
if(import.meta.main){const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';Deno.serve(createHandler(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),key));}
