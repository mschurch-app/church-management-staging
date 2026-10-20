import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(process.env.CALLBACK_SOURCE||'admin-line-callback.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/start\(\);\s*$/,'');
async function run(rows,{completeError=false,rpcError=false,session=true}={}){
 const nodes=new Map(),redirects=[],events=[];
 const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{style:{},addEventListener(){}});return nodes.get(selector);}};
 const db={auth:{getSession:async()=>({data:{session:session?{access_token:'synthetic',refresh_token:'synthetic'}:null}})},rpc:async()=>({data:rows,error:rpcError}),functions:{invoke:async()=>({})}};
 const context={document,URL,URLSearchParams,history:{replaceState(){}},location:{origin:'https://example.test',pathname:'/admin-line-callback.html',hash:'',search:'?return=app&handoff=00000000-0000-4000-8000-000000000001&handoff_key='+ 'a'.repeat(64),replace:path=>{events.push('redirect');redirects.push(path);}},window:{localStorage:{},supabase:{createClient:()=>db},opener:{postMessage:()=>events.push('handoff-ready')}},fetch(){},AbortSignal,setTimeout:fn=>{fn();return 1;},encryptHandoff:async()=>({synthetic:true}),handoffRequest:async()=>{if(completeError)throw Error('synthetic relay failure');events.push('complete');},SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'synthetic',ADMIN_AUTH_STORAGE_KEY:'synthetic'};
 vm.createContext(context);vm.runInContext(source,context);await vm.runInContext('start()',context);return {redirects,events,nodes};
}
test('authorized M+ app return enters automatically after successful handoff',async()=>{const r=await run([{church_id:'M+'}]);assert.deepEqual(r.redirects,['mplus-dashboard.html?church=M%2B']);assert.deepEqual(r.events,['complete','handoff-ready','redirect']);});
test('other church never redirected to M+',async()=>assert.deepEqual((await run([{church_id:'SHiNE'}])).redirects,[]));
test('no grants or failed grant lookup cannot auto enter M+',async()=>{assert.deepEqual((await run([])).redirects,[]);assert.deepEqual((await run([{church_id:'M+'}],{rpcError:true})).redirects,[]);});
test('failed handoff retains recoverable error instead of entering',async()=>{const r=await run([{church_id:'M+'}],{completeError:true});assert.deepEqual(r.redirects,[]);assert.match(r.nodes.get('#status').textContent,/relay failure/);});
test('missing session cannot auto enter',async()=>assert.deepEqual((await run([{church_id:'M+'}],{session:false})).redirects,[]));
