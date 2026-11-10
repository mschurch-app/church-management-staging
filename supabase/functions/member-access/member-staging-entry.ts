import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {makeLineVerifier} from './member-identity.mjs';
import {LINE_LOGIN_CHANNELS} from './line-login-config.mjs';
import {makeMemberService} from './member-service.mjs';
import {makeMemberLimiter} from './member-limiter.mjs';
import {stagingReady} from './member-staging-config.mjs';
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ready=stagingReady({url,key,projectRef:'aqanuwilmvdtlzuqlrau',enabled:Deno.env.get('MEMBER_API_ENABLED')??'true'});
if(!ready){
  Deno.serve(()=>new Response('{"error":"unavailable"}',{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
}else{
  const client=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  Deno.serve(makeMemberService({client,enabled:true,origin:'https://mscos.mchurch.online',verifyIdentity:makeLineVerifier({channels:LINE_LOGIN_CHANNELS,client}),...makeMemberLimiter(client)}));
}
