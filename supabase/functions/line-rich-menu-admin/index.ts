import config from './menus.json' with {type:'json'};
import {stageMenu} from './stage.mjs';
// Internal maintenance only: reuse the existing server-to-server authorization.
const PROJECT=Deno.env.get('SUPABASE_URL')||'';
const KEY=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const LINE=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||'';
const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'method_not_allowed'});
 const secret=req.headers.get('x-cron-secret')||'';
 if(!secret||secret.length>512)return reply(403,{ok:false,error:'forbidden'});
 const auth=await fetch(PROJECT+'/rest/v1/rpc/pastoral_validate_care_cron_secret',{method:'POST',headers:{apikey:KEY,authorization:'Bearer '+KEY,'content-type':'application/json'},body:JSON.stringify({p_secret:secret}),signal:AbortSignal.timeout(10000)});
 if(!auth.ok||(await auth.json())!==true)return reply(403,{ok:false,error:'forbidden'});
 let body;try{body=await req.json()}catch{return reply(400,{ok:false,error:'invalid_body'})}
 if(Object.keys(body).some(k=>!['action','key'].includes(k))||!['audit','stage','test-pastor','test-pastor-old','restore-pastor'].includes(body.action)||(body.action==='stage'&&!Object.hasOwn(config,body.key)))return reply(400,{ok:false,error:'unsupported_action'});
 if(!LINE)return reply(503,{ok:false,error:'line_unconfigured'});
 try{
  const raw=async(path:string)=>{const r=await fetch('https://api.line.me/v2/bot/'+path,{headers:{authorization:'Bearer '+LINE},signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>({}))}};
  const api=async(path:string,options:any={})=>{const r=await fetch((options.dataDomain?'https://api-data.line.me':'https://api.line.me')+'/v2/bot/'+path,{method:options.method||'GET',headers:{authorization:'Bearer '+LINE,...(options.bytes?{'content-type':options.bytes[0]===137?'image/png':'image/jpeg'}:options.body?{'content-type':'application/json'}:{})},body:options.bytes|| (options.body?JSON.stringify(options.body):undefined),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('line_api_'+r.status);return r.json()};
  const download=async(id:string|null,url?:string)=>{const r=await fetch(id?'https://api-data.line.me/v2/bot/richmenu/'+id+'/content':url!,{headers:id?{authorization:'Bearer '+LINE}:{},redirect:'error',signal:AbortSignal.timeout(20000)});const bytes=new Uint8Array(await r.arrayBuffer());const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');return {status:r.status,bytes,sha256}};
  const bot=await raw('info');if(bot.status!==200)return reply(502,{ok:false,error:'bot_read_failed',status:bot.status});
  if(bot.data.basicId!=='@505reyot')return reply(409,{ok:false,error:'wrong_bot',basicId:bot.data.basicId,displayName:bot.data.displayName});
  if(body.action==='stage')return reply(200,{ok:true,result:await stageMenu({config,key:body.key,api,download})});
  if(['test-pastor','test-pastor-old','restore-pastor'].includes(body.action)){
   const staff=await fetch(PROJECT+'/rest/v1/pastoral_staff?select=line_subject,display_name&is_active=eq.true&app_user_id=eq.b7d6ba5d-8e0a-4921-8813-e9f0071b7566',{headers:{apikey:KEY,authorization:'Bearer '+KEY},signal:AbortSignal.timeout(10000)});
   const rows=staff.ok?await staff.json():[];if(rows.length!==1||!/^U[0-9a-f]{32}$/.test(rows[0].line_subject))return reply(409,{ok:false,error:'test_identity_unavailable'});
   const subject=rows[0].line_subject,list=await api('richmenu/list'),ours=list.richmenus.filter((m:any)=>Object.values(config).some(c=>c.menu.name===m.name)),before=await raw('user/'+subject+'/richmenu');
   const linked=before.status===200?before.data.richMenuId:null;
   if(body.action==='restore-pastor'){
    if(!linked||!ours.some((m:any)=>m.richMenuId===linked))return reply(409,{ok:false,error:'not_linked_to_test'});
    await api('user/'+subject+'/richmenu',{method:'DELETE'});const after=await raw('user/'+subject+'/richmenu');
    return reply(200,{ok:true,restored:after.status===404,after_status:after.status,default_changed:false});
   }
   if(before.status!==404&&!ours.some((m:any)=>m.richMenuId===linked))return reply(409,{ok:false,error:'existing_personal_menu_preserved',before_status:before.status});
   const target=ours.find((m:any)=>m.name===config[body.action==='test-pastor-old'?'walk':'bright-closed'].menu.name);if(!target)return reply(409,{ok:false,error:'test_menu_not_ready'});
   for(const spec of Object.values(config)){const alias=await api('richmenu/alias/'+spec.alias);if(!ours.some((m:any)=>m.richMenuId===alias.richMenuId&&m.name===spec.menu.name))return reply(409,{ok:false,error:'test_alias_not_ready'})}
   await api('user/'+subject+'/richmenu/'+target.richMenuId,{method:'POST'});const after=await raw('user/'+subject+'/richmenu');
   return reply(200,{ok:true,test_display_name:rows[0].display_name,before_status:before.status,assigned:after.status===200&&after.data.richMenuId===target.richMenuId,richMenuId:target.richMenuId,default_changed:false});
  }

  const [menus,defaultMenu,aliases]=await Promise.all([raw('richmenu/list'),raw('user/all/richmenu'),raw('richmenu/alias/list')]);
  return reply(200,{ok:true,bot:bot.data,menus,defaultMenu,aliases,mutations:0});
 }catch(error){return reply(502,{ok:false,error:error instanceof Error&&/^(line_api_\d+|invalid_key|duplicate_menu|existing_menu_mismatch|image_integrity_failed|existing_image_mismatch|image_readback_failed|alias_conflict|menu_readback_failed)$/.test(error.message)?error.message:'line_operation_failed'})}
});
