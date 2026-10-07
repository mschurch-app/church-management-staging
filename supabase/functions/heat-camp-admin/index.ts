import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import * as XLSX from 'npm:xlsx@0.18.5';

const origin='https://mscos.mchurch.online';
const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'content-type, apikey, authorization, x-client-info','access-control-allow-methods':'POST, OPTIONS','cache-control':'no-store','vary':'Origin'};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const escapeCell=(value:unknown)=>{const text=String(value??'');return /^[\s]*[=+@-]/.test(text)?`'${text}`:text;};
const labels:Record<string,Record<string,string>>={
  registration_status:{draft:'資料待確認',exception_review:'例外待審',awaiting_pair:'友情價配對中',awaiting_payment:'待付款',paid:'已付款',waitlisted:'候補',cancelled:'已取消',refunded:'已退款'},
  payment_status:{paid:'已付款',awaiting_payment:'待付款',expired:'已逾期',failed:'付款失敗',unpaid:'未建立訂單',refunded:'已退款',cancelled:'已取消'},
  school_stage:{elementary_6_or_below:'國小六年級以下',junior_high:'國中',senior_high:'高中',college_plus:'大專以上'}
};
const displayRow=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,labels[key]?.[String(value)]||value]));
const columns:[string,string][]=[
  ['registration_no','報名編號'],['player_name','球員姓名'],['guardian_name','家長／監護人'],['guardian_phone','聯絡電話'],['email','Email'],
  ['school_stage','年級階段'],['school_name','學校'],['jersey_size','球衣尺寸'],['jersey_number','背號'],['jersey_name','球衣姓名'],
  ['amount','應繳金額'],['registration_status','報名狀態'],['payment_status','付款狀態'],['payment_method','付款方式'],
  ['bank_code','銀行代碼'],['virtual_account_masked','虛擬帳號（遮罩）'],['account_expires_at','繳費期限'],['paid_at','付款時間'],['merchant_order_no','藍新訂單編號'],['created_at','報名時間']
];
function excel(records:Record<string,unknown>[]):Uint8Array{
  const sheet=XLSX.utils.aoa_to_sheet([columns.map(([,label])=>label),...records.map(row=>columns.map(([key])=>escapeCell(row[key])))]);
  sheet['!cols']=columns.map(([key])=>({wch:['guardian_name','player_name','virtual_account_masked'].includes(key)?20:key==='email'?30:16}));
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'報名與繳費');
  return XLSX.write(book,{bookType:'xlsx',type:'array'}) as Uint8Array;
}
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST'||req.headers.get('origin')!==origin)return json(403,{ok:false,error:'forbidden'});
  const authorization=req.headers.get('authorization')||'',token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]||'';
  if(!token)return json(401,{ok:false,error:'login_required'});
  const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!anon||!serviceKey)return json(503,{ok:false,error:'service_unavailable'});
  const authClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await authClient.auth.getUser(token);
  const user=verified.data.user;
  if(verified.error||!user)return json(401,{ok:false,error:'login_required'});
  const input=await req.json().catch(()=>null);
  if(!input||!['list','excel','pdf','details','update'].includes(input.action))return json(400,{ok:false,error:'invalid_request'});
  const action=input.action==='list'?'view':'export';
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(input.action==='details'){
    const details=await admin.rpc('heat_camp_2027_admin_details',{p_user:user.id,p_registration_no:String(input.registration_no||'').slice(0,80)});
    if(details.error){const code=String(details.error.message||'');return json(code.includes('forbidden')?403:404,{ok:false,error:code.includes('forbidden')?'forbidden':'request_failed'});}
    return json(200,{ok:true,...details.data});
  }
  if(input.action==='update'){
    const updated=await admin.rpc('heat_camp_2027_admin_update',{p_user:user.id,p_registration_no:String(input.registration_no||'').slice(0,80),p_changes:input.changes||{}});
    if(updated.error){const code=String(updated.error.message||'');return json(code.includes('forbidden')?403:code.includes('registration_not_found')?404:400,{ok:false,error:code.includes('forbidden')?'forbidden':code.includes('registration_not_found')?'not_found':'invalid_request'});}
    return json(200,{ok:true,saved:Boolean(updated.data)});
  }
  const result=await admin.rpc('heat_camp_2027_admin_list',{
    p_user:user.id,p_action:action,p_search:String(input.search||'').slice(0,100),
    p_status:String(input.status||''),p_payment:String(input.payment||''),
    p_limit:Math.min(Math.max(Number(input.limit)||50,1),100),p_offset:Math.max(Number(input.offset)||0,0)
  });
  if(result.error){
    const code=String(result.error.message||'');
    return json(code.includes('forbidden')?403:code.includes('event_not_found')?503:code.includes('filter_required')?413:400,{ok:false,error:code.includes('forbidden')?'forbidden':code.includes('filter_required')?'filter_required':'request_failed'});
  }
  const payload=result.data as Record<string,unknown>;
  if(input.action==='excel'){
    const bytes=excel(((payload.items||[]) as Record<string,unknown>[]).map(displayRow));
    return json(200,{ok:true,file_name:'heat-camp-2027-registrations.xlsx',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:base64(bytes),total:payload.total_filtered});
  }
  return json(200,{ok:true,...payload});
});
