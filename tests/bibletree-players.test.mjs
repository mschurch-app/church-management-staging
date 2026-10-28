import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHandler,listRequest,hasPlayerAccess} from '../supabase/functions/bibletree-players-admin/handler.mjs';
import {churchLabel,avatarLabel,rewardLabel,validateResult} from '../bibletree-players-model.mjs';
const origin='https://mscos.mchurch.online';
const user={id:'os-user',email_confirmed_at:'2026-01-01',identities:[]};
const grants=['members','tree_reading_admin'].map(permission=>({church_id:'M+',permission}));
const rows={ok:true,players:[],total:0,offset:0,limit:25,stats:{accounts:0}};
function harness(overrides={}){
 const calls=[],data={user,grants,permissions:[],capabilities:{has_line:true},workProfile:{profile:{id:'staff'}},...overrides};
 const fetcher=async(url,options)=>{
  calls.push({url,options});let value;
  if(url.includes('/auth/v1/user')){if(data.badToken)return new Response('{}',{status:401});value=data.user;}
  else if(url.endsWith('get_my_church_access'))value=data.grants;
  else if(url.endsWith('get_my_feature_permissions'))value=data.permissions;
  else if(url.endsWith('get_my_app_capabilities'))value=data.capabilities;
  else if(url.endsWith('get_work_profile'))value=data.workProfile;
  else if(url.endsWith('game_players_admin'))value=rows;
  else throw Error('unexpected request');
  return Response.json(value);
 };
 const handler=createHandler({gameURL:'https://game.example',gameSecret:'service-only-secret',fetcher});
 const request=(body={action:'list'},headers={},method='POST')=>handler(new Request('https://game.example/functions/v1/bibletree-players-admin',{method,headers:{origin,authorization:'Bearer os-token','content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {calls,request};
}
test('only bounded read-only list arguments cross into the game RPC',()=>{
 assert.deepEqual(listRequest({action:'list',query:'  教會  ',p_actor:'forged',limit:1000}),{p_query:'教會',p_filter:'all',p_offset:0,p_limit:25});
 for(const value of [{action:'save'},{action:'list',query:'a'.repeat(81)},{action:'list',filter:'unknown'},{action:'list',offset:-1},{action:'list',offset:1.5},{action:'list',offset:1000001}])assert.equal(listRequest(value),null);
});
test('untrusted origins, missing bearers and write actions cannot query records',async()=>{
 const h=harness();assert.equal((await h.request({}, {origin:'https://evil.example'})).status,403);
 assert.equal((await h.request({action:'list'},{authorization:''})).status,401);
 assert.equal((await h.request({action:'save'})).status,400);assert.equal(h.calls.length,0);
});
test('invalid or game-project token is rejected by OS Auth, regardless of payload role',async()=>{
 const h=harness({badToken:true});assert.equal((await h.request({action:'list',role:'pastor'})).status,403);assert(!h.calls.some(c=>c.url.includes('game_players_admin')));
});
test('both current OS grants are necessary; client role cannot restore revoked access',async()=>{
 for(const g of [[],grants.slice(0,1),grants.map(r=>({...r,church_id:'SHiNE'}))]){
  const h=harness({grants:g});assert.equal((await h.request({action:'list',role:'owner'})).status,403);assert(!h.calls.some(c=>c.url.includes('game_players_admin')));
 }
});
test('view denial and missing trusted identity block player information',async()=>{
 for(const data of [{permissions:[{feature_key:'tree_reading_admin',view:false}]},{capabilities:{has_line:false},workProfile:null},{capabilities:{has_line:false},user:{id:'os-user',user_metadata:{role:'owner'}}}]){
  const h=harness(data);assert.equal((await h.request()).status,403);assert(!h.calls.some(c=>c.url.includes('game_players_admin')));
 }
});
test('confirmed OS work identity can read, without an unnecessary LINE requirement',async()=>{
 const h=harness({capabilities:{has_line:false}});assert.equal((await h.request()).status,200);assert(h.calls.some(c=>c.url.endsWith('get_work_profile')));
});
test('successful read checks fresh grants on every request and keeps service credentials server-side',async()=>{
 const h=harness();for(let i=0;i<2;i++){const r=await h.request({action:'list',filter:'feedback',offset:25});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert(!JSON.stringify(await r.json()).includes('service-only-secret'));}
 assert.equal(h.calls.filter(c=>c.url.endsWith('get_my_church_access')).length,2);
 const game=h.calls.find(c=>c.url.endsWith('game_players_admin'));assert.equal(game.options.headers.authorization,'Bearer service-only-secret');assert.equal(JSON.parse(game.options.body).p_filter,'feedback');
 const auth=h.calls.find(c=>c.url.endsWith('/auth/v1/user'));assert.equal(auth.options.headers.authorization,'Bearer os-token');
});
test('preflight does not require login and GET never returns data',async()=>{
 const h=harness();assert.equal((await h.request(null,{},'OPTIONS')).status,204);assert.equal((await h.request(null,{},'GET')).status,405);assert.equal(h.calls.length,0);
});
test('optional profile fields and future reward timers have honest labels',()=>{
 assert.equal(churchLabel({church_status:'none'}),'目前沒有固定教會');assert.equal(churchLabel({}),'未填寫');assert.equal(avatarLabel('female-2'),'女角色 · 配色 2');assert.equal(avatarLabel('forged'),'尚未選角');
 assert.match(rewardLabel({beta_first_seen_at:'2026-10-28',feedback_count:1}),/首次登入起算 72 小時/);assert.doesNotMatch(rewardLabel({beta_first_seen_at:'2026-10-28',feedback_count:0}),/雙倍/);
 assert.throws(()=>validateResult({...rows,total:-1}));assert.equal(validateResult(rows),rows);
});
test('directory appears only for authorized M+ tree administrators and is searchable',async()=>{
 const {availableFunctionKeys,FUNCTION_CATALOG,matchesFunction,FUNCTION_GROUPS}=await import('../app-function-catalog.mjs');
 const a={grants,featurePermissions:[]};assert(availableFunctionKeys(a,'M+').includes('bibletree_players'));
 assert(!availableFunctionKeys({...a,grants:[]},'M+').includes('bibletree_players'));assert(!availableFunctionKeys(a,'SHiNE').includes('bibletree_players'));
 assert(matchesFunction('bibletree_players','玩家'));assert(FUNCTION_GROUPS.find(g=>g.key==='events').keys.includes('bibletree_players'));assert.equal(FUNCTION_CATALOG.bibletree_players.configurableHome,false);
 const {MPLUS_CENTERS}=await import('../mplus-navigation.mjs');assert(MPLUS_CENTERS.admin.cards.find(([label])=>label==='活動與其他')[1].some(([,key])=>key==='bibletree_players'));assert(!JSON.stringify(MPLUS_CENTERS.church).includes('bibletree_players'));
});
test('personal content never enters the approved SQL response projection',()=>{
 const file=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(s=>s.endsWith('_bibletree_players_admin.sql'));
 const sql=fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');assert(!sql.includes('game_private_journals'));assert(!sql.includes('snapshot,annual,notes'));assert(sql.includes('security invoker'));assert(sql.includes('from public,anon,authenticated'));
});
