import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname,out=new URL('./phase4/results/gate/'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url).pathname;
fs.mkdirSync(out,{recursive:true});
const suite=['phase4/worker.mjs','app-catalog.mjs','phase2/definitions.mjs','phase1/database.mjs','phase1/line-provider.mjs','phase2/service-signup-journey-db.mjs','phase1/browser.mjs','phase1/handoff.mjs','phase1/email-login.mjs','phase2/browser.mjs','phase2/service-signup-list.mjs','phase3/browser.mjs','phase4/browser.mjs','phase1/regression.mjs','phase2/contrast.mjs'];
const selected=process.argv.slice(2);for(const item of selected)if(!suite.includes(item))throw new Error('Unknown test: '+item);
const checks=[];let failures=0;
const run=(args,log)=>new Promise(resolve=>{const stream=fs.createWriteStream(out+log),child=spawn(process.execPath,args,{cwd:path.join(root,'tests'),env:process.env,stdio:['ignore','pipe','pipe']});let text='';for(const pipe of [child.stdout,child.stderr])pipe.on('data',chunk=>{text+=chunk;stream.write(chunk);});child.on('error',error=>{text+=error.message;});child.on('close',code=>{stream.end();resolve({code,text});});});
if(!selected.length){
 const modules=fs.readdirSync(root,{recursive:true}).filter(file=>/\.(mjs|js)$/.test(file)&&!file.startsWith('tests/')&&!file.startsWith('.git/')&&!file.startsWith('vendor/'));
 for(const file of modules){const result=await run(['--check',path.join(root,file)],'syntax-'+file.replaceAll('/','-')+'.log');if(result.code!==0){console.error(result.text);failures++;}}
 checks.push({name:'frontend syntax',files:modules.length,passed:!failures});console.log('SYNTAX',modules.length,failures?'FAILED':'PASS');
}
for(const test of selected.length?selected:suite){console.log('START '+test);const started=Date.now(),result=await run([test],test.replaceAll('/','-')+'.log'),passed=result.code===0;checks.push({name:test,passed,seconds:Math.round((Date.now()-started)/1000),exitCode:result.code});if(!passed){failures++;console.error(result.text.slice(-6000));}console.log((passed?'PASS ':'FAIL ')+test);fs.writeFileSync(out+'summary.json',JSON.stringify({origin:process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769',apiMode:'isolated_synthetic',checks,failures},null,2));}
process.exitCode=failures?1:0;
