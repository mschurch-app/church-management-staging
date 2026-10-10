import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';

// Execute the production handler, replacing only its external SDK, LINE and DB.
// No network, credentials, real member identities or production writes are used.
const file=process.env.TREE_FUNCTION_SOURCE||new URL('../../supabase/functions/tree-reading-october-test/index.ts',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const sdkImport="import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';";
assert.ok(source.includes(sdkImport),'Expected pinned SDK import; review fixture if it changes');
const code=stripTypeScriptTypes(source.replace(sdkImport,''));
const subject='U'+'a'.repeat(32),otherSubject='U'+'b'.repeat(32);
const instant='2026-10-10T05:24:00Z';

export function fixture({start='2026-10-01',joined=true,authorized=true,failInsert=false,failUpdate=false,initial=[],initialNotes=[],initialChallenges=[],memberSubject=subject}={}){
  const rows=structuredClone(initial),writes=[];
  const tables={
    tree_reading_october_test_participants:joined?[{line_subject:memberSubject,reading_start_date:start,is_admin:false}]:[],
    tree_reading_october_test_progress:rows,
    tree_reading_october_test_journal:structuredClone(initialNotes),
    tree_reading_october_test_challenges:structuredClone(initialChallenges),
  };
  function from(table){
    let operation='select',payload,one=false,columns='*',upsertOptions={};
    const filters=[];
    const query={
      select(value='*'){columns=value;return query;},order(){return query;},
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      is(key,value){filters.push(row=>(row[key]??null)===value);return query;},
      maybeSingle(){one=true;return query;},single(){one=true;return query;},
      insert(value){operation='insert';payload=value;return query;},
      upsert(value,options={}){operation='upsert';payload=value;upsertOptions=options;return query;},
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
          }else if(operation==='upsert'){
            const values=Array.isArray(payload)?payload:[payload];selected=[];
            for(const value of values){
              writes.push({table,operation,date:value.reading_date||value.challenge_date});
              const keys=upsertOptions.onConflict.split(','),existing=tables[table].find(row=>keys.every(key=>row[key]===value[key]));
              if(existing){if(!upsertOptions.ignoreDuplicates)Object.assign(existing,value);selected.push(existing);}
              else {const row={...value};tables[table].push(row);selected.push(row);}
            }
          }else if(operation==='update'){
            writes.push({table,operation,matched:selected.length});
            if(failUpdate)error={code:'fixture_failure'};
            else selected.forEach(row=>Object.assign(row,payload));
          }
          if(columns!=='*')selected=selected.map(row=>Object.fromEntries(columns.split(',').filter(key=>key in row).map(key=>[key,row[key]])));
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
      return new Response(JSON.stringify(authorized?{iss:'https://access.line.me',aud:'2011645391',exp:Math.floor(Date.parse(instant)/1000)+3600,iat:Math.floor(Date.parse(instant)/1000)-60,sub:memberSubject,name:'Isolated member'}:{error:'invalid_token'}),{status:authorized?200:401});
    },
  },{filename:'production-tree-reading-october-test.ts'});
  async function call(action,date,token='isolated-token',extra={}){
    const response=await handler(new Request('https://isolated.invalid/function',{
      method:'POST',headers:{origin:'https://mscos.mchurch.online','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
      body:JSON.stringify({action,readingDate:date,line_subject:otherSubject,...extra}),
    }));
    return {status:response.status,...await response.json()};
  }
  return {call,rows,writes};
}
