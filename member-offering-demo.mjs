// Synthetic preview only. This transport never calls a production API or stores real member data.
export function makeDemoTransport({now=Date.now}={}){
 const records=Array.from({length:237},(_,i)=>({id:`demo-${i+1}`,date:`2026-${String(12-Math.floor(i/20)).padStart(2,'0')}-${String(28-i%20).padStart(2,'0')}`,amount:100+(i%5)*100,state:i%13===0?'returned':i%7===0?'pending':'confirmed',method:i%2?'cash':'transfer',categories:[{name:i%3?'感恩奉獻':'十一奉獻',amount:100+(i%5)*100}]})).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const receipts=[{id:'demo-receipt-1',number:'測試字第20260001號',date:'2026-11-15',amount:1200,state:'issued',title:'合成測試會友',project:'感恩奉獻'},{id:'demo-receipt-2',date:'2026-11-08',amount:800,state:'draft',project:'十一奉獻'},{id:'demo-receipt-3',number:'測試字第20260002號',date:'2026-10-25',amount:500,state:'voided',project:'感恩奉獻'}];
 let challenge=null,session=null,attempts=0,blockedUntil=0,starts=[];
 const assertSession=token=>{if(!session||session.token!==token||session.expires<=now()){session=null;throw Error('session_expired');}};
 return async(action,input={})=>{
  if(action==='start'){starts=starts.filter(t=>t>now()-900000);if(now()<blockedUntil||starts.length>=3||(starts.length&&now()-starts.at(-1)<60000))throw Error('rate_limited');starts.push(now());challenge={id:crypto.randomUUID(),expires:now()+300000};attempts=0;return{challengeId:challenge.id,destination:'測試收件匣（不寄信）',expiresIn:300,demoCode:'246810'};}
  if(action==='verify'){if(now()<blockedUntil)throw Error('rate_limited');if(!challenge||input.challengeId!==challenge.id||challenge.expires<=now())throw Error('challenge_expired');if(input.code!=='246810'){if(++attempts>=5){blockedUntil=now()+30000;challenge=null;}throw Error(attempts>=5?'rate_limited':'code_mismatch');}challenge=null;session={token:crypto.randomUUID(),expires:now()+600000};return{token:session.token,expiresIn:600};}
  if(action==='lock'){session=null;challenge=null;return{ok:true};}
  assertSession(input.token);
  if(action==='list'){if(![2026,2027].includes(input.year)||!Number.isInteger(input.page)||input.page<0||input.page>10000)throw Error('invalid_input');const rows=input.year===2026?records:[],confirmed=rows.filter(r=>r.state==='confirmed');return{demo:true,offeringCode:'0028',years:[2027,2026],year:input.year,total:confirmed.reduce((a,r)=>a+r.amount,0),confirmedCount:confirmed.length,pendingCount:rows.filter(r=>r.state==='pending').length,items:rows.slice(input.page*20,input.page*20+20),hasNext:rows.length>(input.page+1)*20,receipts:input.year===2026?receipts:[]};}
  if(action==='receipt'){const r=receipts.find(r=>r.id===input.id&&r.state==='issued');if(!r)throw Error('receipt_unavailable');return{...r,demo:true};}
  throw Error('invalid_input');
 };
}
