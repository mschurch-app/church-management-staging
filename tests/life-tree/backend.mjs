import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';

// Execute the production handler, replacing only its external SDK, LINE and DB.
// No network, credentials, real member identities or production writes are used.
const file=process.env.TREE_FUNCTION_SOURCE||new URL('../../supabase/functions/tree-reading-october-test/index.ts',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const sdkImport="import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';";
assert.ok(source.includes(sdkImport),'Expected pinned SDK import; review fixture if it changes');
const code=stripTypeScriptTypes(source.replace(sdkImport,''));
const subject='U'+'a'.repeat(32),otherSubject='U'+'b'.repeat(32);
const instant='2026-10-10T05:24:00Z';

function fixture({start='2026-10-01',joined=true,authorized=true,failInsert=false,failUpdate=false,initial=[]}={}){
  const rows=structuredClone(initial),writes=[];
  const tables={
    tree_reading_october_test_participants:joined?[{line_subject:subject,reading_start_date:start,is_admin:false}]:[],
    tree_reading_october_test_progress:rows,
  };
  function from(table){
    let operation='select',payload,one=false;
    const filters=[];
    const query={
      select(){return query;},order(){return query;},
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      is(key,value){filters.push(row=>(row[key]??null)===value);return query;},
      maybeSingle(){one=true;return query;},single(){one=true;return query;},
      insert(value){operation='insert';payload=value;return query;},
      update(value){operation='update';payload=value;return query;},
      then(resolve,reject){
        return Promise.resolve().then(()=>{
          assert.ok(table in tables,'Unexpected DB table '+table);
          let selected=tables[table].filter(row=>filters.every(filter=>filter(row))),error=null;
          if(operation==='insert'){
            writes.push({table,operation,date:payload.reading_date});
            if(failInsert)error={code:'fixture_failure'};
            else if(tables[table].some(row=>row.line_subject===payload.line_subject&&row.reading_date===payload.reading_date))error={code:'23505'};
            else {const row={...payload,completed_at:instant,watered_at:null};tables[table].push(row);selected=[row];}
          }else if(operation==='update'){
            writes.push({table,operation,matched:selected.length});
            if(failUpdate)error={code:'fixture_failure'};
            else selected.forEach(row=>Object.assign(row,payload));
          }
          return {data:structuredClone(one?(selected[0]||null):selected),error};
        }).then(resolve,reject);
      },
    };
    return query;
  }
  let handler;
  const RealDate=Date;
  class FrozenDate extends RealDate{
    constructor(...args){super(...(args.length?args:[instant]));}
    static now(){return RealDate.parse(instant);}
  }
  vm.runInNewContext(code,{
    Deno:{env:{get:key=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'isolated-not-a-credential'}[key])},serve:fn=>{handler=fn;}},
    createClient:()=>({from}),Date:FrozenDate,Intl,URLSearchParams,Request,Response,AbortSignal,TextEncoder,crypto:webcrypto,
    fetch:async(url)=>{
      assert.equal(url,'https://api.line.me/oauth2/v2.1/verify','No real network allowed');
      return new Response(JSON.stringify(authorized?{iss:'https://access.line.me',aud:'2011645391',exp:Math.floor(Date.parse(instant)/1000)+3600,iat:Math.floor(Date.parse(instant)/1000)-60,sub:subject,name:'Isolated member'}:{error:'invalid_token'}),{status:authorized?200:401});
    },
  },{filename:'production-tree-reading-october-test.ts'});
  async function call(action,date,token='isolated-token'){
    const response=await handler(new Request('https://isolated.invalid/function',{
      method:'POST',headers:{origin:'https://mscos.mchurch.online','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
      body:JSON.stringify({action,readingDate:date,line_subject:otherSubject}),
    }));
    return {status:response.status,...await response.json()};
  }
  return {call,rows,writes};
}

test('Yesterday (10/9) is recorded and watered through the real handler',async()=>{
  const f=fixture(),read=await f.call('mark_read','2026-10-09');
  assert.equal(read.status,200);assert.equal(read.completion_type,'makeup');
  assert.equal(read.records[0].reading_date,'2026-10-09');assert.equal(read.records[0].watered_at,null);
  const water=await f.call('water_tree','2026-10-09');assert.equal(water.status,200);assert.ok(water.records[0].watered_at);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].line_subject,subject);
});
test('All seven makeup dates 10/3–10/9 can be recorded and watered',async()=>{
  const f=fixture();
  for(let day=3;day<=9;day++){
    const date='2026-10-'+String(day).padStart(2,'0');
    assert.equal((await f.call('mark_read',date)).status,200,date+' read');
    assert.equal((await f.call('water_tree',date)).status,200,date+' water');
  }
  assert.equal(f.rows.length,7);assert.ok(f.rows.every(row=>row.completion_type==='makeup'&&row.watered_at));
});
test('Today remains on time and can be watered',async()=>{
  const f=fixture();assert.equal((await f.call('mark_read','2026-10-10')).completion_type,'on_time');
  assert.equal((await f.call('water_tree','2026-10-10')).status,200);
});
for(const date of ['2026-10-02','2026-10-11','2026-09-30','bad-date'])test('Invalid/expired/future date '+date+' causes no writes',async()=>{
  const f=fixture();
  for(const action of ['mark_read','water_tree']){
    const result=await f.call(action,date);assert.equal(result.status,400);assert.equal(result.error,'date_not_allowed');
  }
  assert.equal(f.writes.length,0);
});
test('Participant start date remains enforced',async()=>{
  const f=fixture({start:'2026-10-05'});
  for(const action of ['mark_read','water_tree'])assert.equal((await f.call(action,'2026-10-04')).error,'date_not_allowed');
  assert.equal(f.writes.length,0);assert.equal((await f.call('mark_read','2026-10-05')).status,200);
});
test('Duplicate makeup read and water preserve completion and watering timestamps',async()=>{
  const original={line_subject:subject,reading_date:'2026-10-09',completion_type:'on_time',completed_at:'2026-10-09T01:00:00Z',watered_at:'2026-10-09T01:01:00Z'};
  const f=fixture({initial:[original]});
  assert.equal((await f.call('mark_read','2026-10-09')).status,200);
  assert.equal((await f.call('water_tree','2026-10-09')).status,200);
  assert.deepEqual(f.rows,[original]);
});
test('Watering cannot create an unread record or water another person',async()=>{
  const other={line_subject:otherSubject,reading_date:'2026-10-09',completion_type:'makeup',watered_at:null};
  const f=fixture({initial:[other]});assert.equal((await f.call('water_tree','2026-10-09')).error,'read_first');assert.deepEqual(f.rows,[other]);
});
test('Invalid LINE verification cannot read or write',async()=>{
  const f=fixture({authorized:false});
  for(const action of ['mark_read','water_tree'])assert.equal((await f.call(action,'2026-10-09')).status,401);
  assert.equal(f.writes.length,0);
});
test('Missing bearer token cannot write',async()=>{
  const f=fixture();assert.equal((await f.call('mark_read','2026-10-09','')).status,401);assert.equal(f.writes.length,0);
});
test('Unjoined LINE member cannot write',async()=>{
  const f=fixture({joined:false});assert.equal((await f.call('mark_read','2026-10-09')).error,'join_required');assert.equal(f.writes.length,0);
});
test('Database insert failure remains a failure, with no fabricated completion',async()=>{
  const f=fixture({failInsert:true}),result=await f.call('mark_read','2026-10-09');
  assert.equal(result.status,503);assert.equal(result.error,'unavailable');assert.equal(f.rows.length,0);
});
test('Database watering failure preserves unread-water state',async()=>{
  const f=fixture({failUpdate:true});await f.call('mark_read','2026-10-09');
  assert.equal((await f.call('water_tree','2026-10-09')).status,503);assert.equal(f.rows[0].watered_at,null);
});
