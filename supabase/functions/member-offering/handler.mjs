// Candidate production reader. Activation stays off until verified-contact delivery is accepted.
// The browser provides credentials and an opaque short-lived query token, never a member ID.
export function makeOfferingHandler({enabled=false,origin='https://mscos.mchurch.online',verifyIdentity,consumeEntry,consumeLimit,read}={}){
 return async request=>{
  const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':origin,vary:'Origin'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(request.headers.get('origin')!==origin)return reply(403,{error:'origin_rejected'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}});
  if(!enabled||![verifyIdentity,consumeEntry,consumeLimit,read].every(f=>typeof f==='function'))return reply(503,{error:'not_open'});
  if(request.method!=='POST')return reply(405,{error:'method_rejected'});
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'json_required'});
  try{
   if(!await consumeEntry())return reply(429,{error:'try_later'});
   const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_input'});let size=0,chunks=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>16384){await reader.cancel();return reply(413,{error:'too_large'});}chunks.push(r.value);}const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}let input;try{input=JSON.parse(new TextDecoder().decode(data));}catch{return reply(400,{error:'invalid_input'});}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','church','idToken','accessToken','sessionToken','queryToken','year','page'].includes(k))||input.action!=='list'||input.church!=='M+'||typeof input.queryToken!=='string'||!/^[0-9a-f]{64}$/.test(input.queryToken)||!Number.isInteger(input.year)||input.year<2020||input.year>2100||!Number.isInteger(input.page)||input.page<0||input.page>10000)return reply(400,{error:'invalid_input'});
   let identity;try{identity=await verifyIdentity({church:input.church,idToken:input.idToken,accessToken:input.accessToken,sessionToken:input.sessionToken});}catch{return reply(401,{error:'login_required'});}
   if(identity?.church!=='M+')return reply(403,{error:'forbidden'});
   if(!await consumeLimit(identity,'status'))return reply(429,{error:'try_later'});
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.queryToken)))].map(n=>n.toString(16).padStart(2,'0')).join('');
   const result=await read({p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject,p_session_hash:hash,p_year:input.year,p_page:input.page});
   return reply(200,result);
  }catch(error){return reply(error?.code==='42501'?403:503,{error:error?.code==='42501'?'verification_required':'unavailable'});}
 };
}
