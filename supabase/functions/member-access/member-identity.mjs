// Server-only. Never expose service credentials or tokens in logs.
export function makeLineVerifier({channels={},fetcher=fetch,now=Date.now,client}={}){
 return async ({church,idToken,accessToken,sessionToken})=>{
  const channel=['M+','SHiNE'].includes(church)?channels[church]:null;
  if(typeof channel!=='string'||!/^\d+$/.test(channel))throw Error('identity_unconfigured');
  const validToken=t=>typeof t==='string'&&t.trim()&&t.length<=8192;
  let subject;
  try{
   if(sessionToken){
    if(!validToken(sessionToken)||idToken||accessToken||!client)throw Error();
    const result=await client.auth.getUser(sessionToken);
    if(result.error)throw Error();
    // Auth identities are server-owned; user_metadata is never an authority.
    const identities=result.data?.user?.identities?.filter(i=>i.provider==='custom:line-web')||[];
    if(identities.length!==1)throw Error();subject=identities[0].identity_data?.sub;
   }else if(idToken){
    if(!validToken(idToken))throw Error();
    const response=await fetcher('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:idToken,client_id:channel})});
    if(!response.ok)throw Error();const claims=await response.json(),seconds=Math.floor(now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==channel||!Number.isSafeInteger(claims.exp)||claims.exp<=seconds||!Number.isSafeInteger(claims.iat)||claims.iat>seconds+60||claims.iat>=claims.exp)throw Error();subject=claims.sub;
   }else{
    if(!validToken(accessToken))throw Error();
    const checked=await fetcher('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(accessToken),{redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!checked.ok)throw Error();const value=await checked.json();if(value.client_id!==channel||!Number.isFinite(value.expires_in)||value.expires_in<=0)throw Error();
    const response=await fetcher('https://api.line.me/v2/profile',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+accessToken}});
    if(!response.ok)throw Error();subject=(await response.json()).userId;
   }
   if(typeof subject!=='string'||!/^U[0-9a-f]{32}$/.test(subject))throw Error();
   return Object.freeze({church,channel,subject});
  }catch{throw Error('identity_rejected');}
 };
}

export function selfPatch(input){
  const limits={phone:40,district:100,birthday:10,gender:40};
  if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length)throw new Error('invalid_patch');
  const result={};
  for(const [key,value] of Object.entries(input)){
    if(!Object.hasOwn(limits,key)||typeof value!=='string'||value.length>limits[key])throw new Error('invalid_patch');
    const clean=value.trim();
    if(key==='birthday'&&clean&&(!/^\d{4}-\d{2}-\d{2}$/.test(clean)||!Number.isFinite(Date.parse(clean))||new Date(clean).toISOString().slice(0,10)!==clean))throw new Error('invalid_patch');
    result[key]=key==='birthday'&&!clean?null:clean;
  }
  return result;
}
