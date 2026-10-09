import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url).pathname,commit=process.argv[2]||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),origin=process.env.CHURCH_TEST_ORIGIN||'https://mscos.mchurch.online';
const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r',commit],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(file=>!file.startsWith('tests/')&&!file.startsWith('docs/')&&/\.(html|mjs|css|js)$/.test(file));
if(files.length<15)throw new Error('Release source commit required');
const hash=data=>createHash('sha256').update(data).digest('hex'),expected=new Map(files.map(file=>[file,hash(execFileSync('git',['show',commit+':'+file],{cwd:root}))]));
let results=[];
for(let attempt=1;attempt<=20;attempt++){
 results=[];
 for(let index=0;index<files.length;index+=8){await Promise.all(files.slice(index,index+8).map(async file=>{let item={file,local_sha256:expected.get(file)};try{const response=await fetch(origin+'/'+file+'?v=20261009-stage4&release='+commit.slice(0,8),{cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer());Object.assign(item,{status:response.status,served_sha256:hash(bytes),match:response.ok&&hash(bytes)===expected.get(file)});}catch(error){item.error=error.message;item.match=false;}results.push(item);}));}
 const mismatches=results.filter(item=>!item.match);console.log(JSON.stringify({attempt,files:files.length,matched:results.length-mismatches.length,mismatches:mismatches.slice(0,5).map(item=>item.file)}));
 if(!mismatches.length){fs.writeFileSync(path.join(root,'docs/reports/2026-10-09-phase4/deployment.json'),JSON.stringify({origin,commit,verified_at:new Date().toISOString(),files:results},null,2)+'\n');process.exit(0);}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
throw new Error('Published files did not match release');
