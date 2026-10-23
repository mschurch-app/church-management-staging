import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildStoryPresentation} from '../../testimony-layout-plan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),id='71000000-0000-4000-8000-000000000010';
export async function startReviewFixture(port=0){
 const states=new Map(),server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'");
  const send=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/admin-db.mjs'){res.setHeader('content-type','text/javascript');res.end(`const p=new URLSearchParams(location.search),role=p.get('role')||'initial',token=role+':'+p.get('case')+':'+p.get('completed');export const db={auth:{getSession:async()=>({data:{session:role==='signedout'?null:{access_token:token}}})}};`);return;}
  if(url.pathname==='/tests/testimony-api'){
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw),token=(req.headers.authorization||'').replace('Bearer ',''),[role,,completed]=token.split(':');
   if(role==='stranger')return send({ok:false,error:'forbidden'},403);
   if(!states.has(token))states.set(token,{calls:[],failed:false,item:{id,status:'pending',version:1,created_at:new Date().toISOString(),payload:{name:'合成投稿人',contact:'qa@example.invalid',display_name:'匿名分享',category:'其他',consent:true,media:[],title:'合成雲彩見證',body:'合成文字，供初審與複審驗收。'},initial_reviewed_at:completed==='1'?new Date().toISOString():null,initial_review_note:completed==='1'?'合成初審備註':''}});
   const s=states.get(token);if(token.includes('layout')){s.item.payload.body=Array.from({length:6},(_,i)=>'合成段落 '+(i+1)+'：'+('這是用來驗證照片穿插段落及文字繞圖的合成內容。'.repeat(6))).join('\n\n');s.item.payload.media=Array.from({length:3},(_,slot)=>({slot,kind:'photo'}));s.item.payload.media_consent=true;}s.calls.push(input);
   if(token.includes('illustration')){s.item.payload.body='合成第一段，描述安靜等候。\n\n合成第二段，描述平安與盼望。\n\n合成第三段，為分享收尾。';s.item.payload.media=[];s.item.payload.media_consent=false;s.item.payload.presentation={version:1,paragraphs:[],placements:[],illustrations:[]};s.item.payload.presentation=buildStoryPresentation(s.item.payload.body,[]);s.item.payload.presentation.illustrations=[{key:'quiet-waiting-v1',after:0,style:'right'}];}
   if(input.action==='admin_media'){if(token.includes('mediafailure'))return send({ok:false,error:'media_unavailable'},503);return send({ok:true,media:s.item.payload.media.map(m=>({...m,url:'http://127.0.0.1:'+server.address().port+'/tests/photo.svg?slot='+m.slot}))});}
   if(input.action==='list')return send({ok:true,can_approve:role==='final',can_initial_review:role==='initial',initial_review_enabled:true,items:[s.item]});
   if(input.action==='initial_review'&&role==='initial'){
    if(token.includes('failure')&&!s.failed){s.failed=true;return send({ok:false,error:'unavailable'},503);}
    if(!input.review.confirmed)return send({ok:false,error:'consent_required'},400);
    s.item.initial_reviewed_at=new Date().toISOString();s.item.initial_review_note=input.review.note;s.item.version++;return send({ok:true,status:'pending'});
   }
   if(input.action==='review'&&role==='final'){
    if(!s.item.initial_reviewed_at)return send({ok:false,error:'initial_review_required'},400);s.item.status='published';s.item.version++;return send({ok:true,status:'published'});
   }
   return send({ok:false,error:'forbidden'},403);
  }
  if(url.pathname==='/tests/photo.svg'){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#dce4d8"/><text x="40" y="80" font-size="32">SYNTHETIC PHOTO '+url.searchParams.get('slot')+'</text></svg>');return;}
  if(url.pathname==='/church-brand.mjs'){res.setHeader('content-type','text/javascript');res.end('');return;}
  if(url.pathname==='/admin-login.html'){res.end('<h1>合成登入入口</h1>');return;}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{let data=await fs.readFile(file);if(url.pathname==='/testimony-admin.mjs')data=Buffer.from(data.toString().replace('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/testimony-intake','/tests/testimony-api'));res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'image/svg+xml');res.end(data);}catch{res.writeHead(404);res.end();}
 });await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {origin:'http://127.0.0.1:'+server.address().port,states,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const fixture=await startReviewFixture(Number(process.env.PORT)||57515);console.log(fixture.origin+'/testimony-admin.html?church=M%2B&submission='+id+'&role=initial&case=native');}
