// Isolated fixture server. Never connects to production auth or database.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {emptyDraft} from '../sermon-preparation-contract.mjs';
const root=path.resolve(new URL('../',import.meta.url).pathname),id='00000000-0000-4000-8000-000000000001';
let project={id,title:'信息預備驗收',speaker:'驗收講員',scripture:'詩篇 23:1–3',version:1,backup_version:1,updated_at:new Date().toISOString()},payload=emptyDraft({title:project.title,speaker:project.speaker,scripture:project.scripture,service_date:''}),jobs=[];
const access={grants:[{church_id:'M+',permission:'website_weekly'},{church_id:'M+',permission:'pastoral_chats'}],featurePermissions:[]};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.join(root,decodeURIComponent(url.pathname));
 if(url.pathname==='/fixture-db.mjs'){res.setHeader('Content-Type','application/javascript');return res.end('export const db={auth:{getSession:async()=>({data:{session:{access_token:"isolated-fixture"}}})}}');}
 if(url.pathname==='/fixture-access.mjs'){res.setHeader('Content-Type','application/javascript');return res.end(`export {canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';export const readAccess=async()=>(${JSON.stringify(access)});`);}
 if(url.pathname==='/fixture-api'){
  let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);let data={};
  if(input.action==='list')data={items:[project],worker:{online:true,summary:{counts:{web_documents:4649}}}};
  if(input.action==='load')data={project,payload,jobs,versions:[{version:project.version,created_at:project.updated_at}]};
  if(input.action==='save'){payload=input.payload;project={...project,...payload.information,version:project.version+1,backup_version:project.version};data={project,payload};}
  if(input.action==='enqueue'){const job={id:crypto.randomUUID(),kind:input.kind,status:'queued',base_version:project.version};jobs.unshift(job);data={job};}
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,...data}));
 }
 if(!file.startsWith(root+'/'))return res.writeHead(403).end();
 try{let data=fs.readFileSync(file);if(url.pathname==='/sermon-preparation.mjs')data=Buffer.from(data.toString().replace("'./admin-db.mjs?v=20261012-readable2'","'./fixture-db.mjs'").replace("'./admin-access.mjs?v=20261009-stage1'","'./fixture-access.mjs'").replace('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/sermon-preparation','/fixture-api'));
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch{res.writeHead(404).end();}
}).listen(8770,'127.0.0.1',()=>console.log('Isolated sermon preview http://127.0.0.1:8770/sermon-preparation.html?church=M%2B&project='+id));
