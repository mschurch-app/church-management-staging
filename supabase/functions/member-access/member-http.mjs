import {selfPatch} from './member-identity.mjs';

const MEMBER_PROFILE_FIELDS=Object.freeze([
  'name','phone','district','birthday','gender','group_name',
  'baptism_date','faith_status','age_group','growth_progress'
]);

// Server-only HTTP core. Identity verification and the persistent rate limiter
// are mandatory before any member data is returned.
export function makeMemberHandler({enabled=false,verifyIdentity,consumeEntry,consumeLimit,status,requestBinding,update,claim,origin='https://mschurch-app.github.io'}){
  return async request=>{
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin'};
    const reply=(code,body)=>new Response(JSON.stringify(body),{status:code,headers});
    if(request.headers.get('origin')!==origin)return reply(403,{error:'origin_rejected'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
    if(!enabled||typeof consumeLimit!=='function'||typeof consumeEntry!=='function')return reply(503,{error:'unavailable'});
    if(request.method!=='POST')return reply(405,{error:'method_rejected'});
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply(415,{error:'json_required'});
    try{
      if(!await consumeEntry())return reply(429,{error:'try_later'});
      const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_input'});
      const chunks=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return reply(413,{error:'too_large'});}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'invalid_input'});}
      const fields={lookup:['query'],claim_select:['candidate'],claim_verify:['candidate','answer'],status:[],onboarding:[],request:['request_id','name','phone'],update:['patch']};
      if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(fields,input.action)||Object.keys(input).some(key=>!['action','church','idToken','accessToken','sessionToken',...fields[input.action]].includes(key)))return reply(400,{error:'invalid_input'});
      let identity;try{identity=await verifyIdentity({church:input.church,idToken:input.idToken,accessToken:input.accessToken,sessionToken:input.sessionToken});}catch{return reply(401,{error:'login_required'});}
      if(!await consumeLimit(identity,['onboarding','lookup','claim_select','claim_verify'].includes(input.action)?'status':input.action))return reply(429,{error:'try_later'});
      if(['lookup','claim_select','claim_verify'].includes(input.action)){
        const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
        if(typeof claim!=='function')return reply(503,{error:'unavailable'});
        if(input.action==='lookup'?(typeof input.query!=='string'||!input.query.trim()||input.query.length>80):(!uuid(input.candidate)||(input.action==='claim_verify'&&(typeof input.answer!=='string'||!input.answer.trim()||input.answer.length>40))))return reply(400,{error:'invalid_input'});
        const action={lookup:'search',claim_select:'select',claim_verify:'verify'}[input.action];
        const result=await claim(identity,action,action==='search'?{query:input.query.trim()}:action==='select'?{candidate:input.candidate}:{candidate:input.candidate,answer:input.answer});
        if(result?.state==='candidates'&&Array.isArray(result.candidates))return reply(200,{state:'candidates',candidates:result.candidates.slice(0,8).map(c=>({token:c.token,name:c.name}))});
        if(result?.state==='challenge'&&['phone','birthday'].includes(result.method))return reply(200,{state:'challenge',method:result.method});
        if(result?.state==='verified'&&result.member&&uuid(result.claimToken))return reply(200,{state:'verified',claimToken:result.claimToken,member:Object.fromEntries(['name','phone','birthday','gender','district','age_group','faith_status','know_us_from','desired_feelings','interest_tags'].map(k=>[k,result.member[k]??(['desired_feelings','interest_tags'].includes(k)?[]:'')]))});
        if(['mismatch','expired','review_required','limited'].includes(result?.state))return reply(200,{state:result.state});
        return reply(503,{error:'unavailable'});
      }
      if(input.action==='status'||input.action==='onboarding'){
        const result=await status(identity);
        if(!['unbound','pending','approved','rejected','revoked'].includes(result?.state))return reply(503,{error:'unavailable'});
        if(input.action==='onboarding')return reply(200,{state:result.state,registered:result.state==='approved'});
        if(result.state!=='approved')return reply(200,{state:result.state});
        if(!result.member)return reply(503,{error:'unavailable'});
        return reply(200,{state:'approved',member:Object.fromEntries(MEMBER_PROFILE_FIELDS.map(key=>[key,result.member[key]??'']))});
      }
      if(input.action==='request'){
        const {action,...submission}=input;
        if(!await requestBinding(identity,submission))return reply(409,{error:'request_unavailable'});
        return reply(200,{received:true});
      }
      let patch;try{patch=selfPatch(input.patch);}catch{return reply(400,{error:'invalid_patch'});}
      if(!await update(identity,patch))return reply(403,{error:'member_unavailable'});
      return reply(200,{updated:true});
    }catch{return reply(503,{error:'unavailable'});}
  };
}
