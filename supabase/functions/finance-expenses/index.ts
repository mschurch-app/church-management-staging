import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {recognizeReceiptImage,OCR_MODEL} from './ocr.mjs';
import {receiptMime} from './receipt.mjs';
import { financeAccounts } from '../finance-cash/accounts.ts';

const APP_ORIGIN = 'https://mscos.mchurch.online';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = (origin: string) => ({
  ...(origin === APP_ORIGIN ? { 'access-control-allow-origin': origin } : {}),
  'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
  'access-control-allow-methods': 'POST,OPTIONS',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'vary': 'Origin'
});
const reply = (origin: string, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
type Input = Record<string, unknown>;

function client(key: string, token?: string) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  if (!url || !key) throw new Error('config');
  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

Deno.serve(async request => {
 const origin=request.headers.get('origin')||'';
 if(request.method==='OPTIONS')return new Response('ok',{headers:headers(origin)});
 if(request.method!=='POST'||origin!==APP_ORIGIN)return reply(origin,403,{ok:false,code:'forbidden'});
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return reply(origin,401,{ok:false,code:'login_required'});
 try{
  const admin=client(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'');
  const checked=await admin.auth.getUser(token);if(checked.error||!checked.data.user)return reply(origin,401,{ok:false,code:'login_required'});
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
   if(Number(request.headers.get('content-length')||0)>9*1024*1024)return reply(origin,413,{ok:false,code:'photo_too_large'});
   const form=await request.formData(),file=form.get('file'),id=String(form.get('id')||''),receiptId=String(form.get('receiptId')||'');
   if(!(file instanceof File)||!UUID.test(id)||!UUID.test(receiptId)||file.size<1||file.size>8388608)return reply(origin,400,{ok:false,code:'invalid_photo'});
   const bytes=new Uint8Array(await file.arrayBuffer());let mime;try{mime=receiptMime(bytes);}catch{return reply(origin,400,{ok:false,code:'invalid_photo'});}
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   const prepared=await admin.rpc('finance_expense_receipt_api',{p_actor:checked.data.user.id,p_action:'prepare',p_input:{id,receiptId,fileName:file.name.slice(0,160)||'憑證照片',mimeType:mime,size:file.size,sha256:hash}});
   if(prepared.error)return reply(origin,403,{ok:false,code:'receipt_upload_forbidden'});
   if(prepared.data.state!=='ready'){
    const uploaded=await admin.storage.from('finance-expense-receipts').upload(prepared.data.path,bytes,{contentType:mime,upsert:false});
    if(uploaded.error&&String(uploaded.error.statusCode)!=='409')return reply(origin,503,{ok:false,code:'receipt_upload_failed'});
    const completed=await admin.rpc('finance_expense_receipt_api',{p_actor:checked.data.user.id,p_action:'complete',p_input:{id,receiptId}});
    if(completed.error)return reply(origin,503,{ok:false,code:'receipt_upload_failed'});
   }
   return reply(origin,200,{ok:true,receipt:{id:receiptId,name:prepared.data.name}});
  }
  const raw=await request.text();if(raw.length>20000)return reply(origin,413,{ok:false,code:'invalid_request'});
  let input;try{input=JSON.parse(raw);}catch{return reply(origin,400,{ok:false,code:'invalid_request'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(origin,400,{ok:false,code:'invalid_request'});
  const action=String(input.action||'');
  if(action==='recognize_receipt'||action==='receipt_ocr_result'){
   if(!UUID.test(String(input.id||''))||!UUID.test(String(input.receiptId||'')))return reply(origin,400,{ok:false,code:'invalid_request'});
   const key=Deno.env.get('GEMINI_API_KEY')||'';
   if(action==='recognize_receipt'&&!key)return reply(origin,503,{ok:false,code:'ocr_not_configured'});
   const claimId=crypto.randomUUID(),values={id:input.id,receiptId:input.receiptId,claimId};
   const claimed=await admin.rpc('finance_expense_ocr_api',{p_actor:checked.data.user.id,p_action:action==='receipt_ocr_result'?'get':'claim',p_input:values});
   if(claimed.error){const code=claimed.error.message.includes('ocr_rate_limited')?'ocr_rate_limited':'forbidden';return reply(origin,code==='ocr_rate_limited'?429:403,{ok:false,code});}
   if(claimed.data.status!=='claimed')return reply(origin,200,{ok:true,ocr:claimed.data});
   const model=Deno.env.get('FINANCE_RECEIPT_OCR_MODEL')||OCR_MODEL;
   const job=(async()=>{try{
    const downloaded=await admin.storage.from('finance-expense-receipts').download(claimed.data.path);
    if(downloaded.error||!downloaded.data||downloaded.data.size>8388608)throw Error('ocr_photo_unavailable');
    const result=await recognizeReceiptImage({bytes:new Uint8Array(await downloaded.data.arrayBuffer()),mimeType:claimed.data.mimeType,key,model});
    const saved=await admin.rpc('finance_expense_ocr_api',{p_actor:checked.data.user.id,p_action:'finish',p_input:{...values,result,model}});
    if(saved.error)throw Error('ocr_save_failed');

   }catch(error){
    const allowed=['ocr_rate_limited','ocr_provider_failed','ocr_photo_unavailable','ocr_invalid_result','ocr_incomplete','ocr_save_failed'];
    const code=error instanceof Error&&allowed.includes(error.message)?error.message:'ocr_timeout';
    await admin.rpc('finance_expense_ocr_api',{p_actor:checked.data.user.id,p_action:'fail',p_input:{...values,error:code,model}});

   }})();
   EdgeRuntime.waitUntil(job.catch(()=>undefined));
   return reply(origin,200,{ok:true,ocr:{status:'processing'}});
  }
  if(action==='receipt_view'){
   const receipt=await admin.rpc('finance_expense_receipt_api',{p_actor:checked.data.user.id,p_action:'view',p_input:input});
   if(receipt.error)return reply(origin,403,{ok:false,code:'forbidden'});
   const signed=await admin.storage.from('finance-expense-receipts').createSignedUrl(receipt.data.path,60);
   if(signed.error)return reply(origin,503,{ok:false,code:'receipt_unavailable'});
   return reply(origin,200,{ok:true,url:signed.data.signedUrl});
  }
  if(!['profile','accounts','assign_role','list','get','save','submit','verify','review','approve','pay','return','void'].includes(action))return reply(origin,400,{ok:false,code:'invalid_request'});
  const result=await admin.rpc('finance_expense_api',{p_actor:checked.data.user.id,p_action:action==='accounts'?'roles':action,p_input:input});
  if(result.error){const code=result.error.message.match(/forbidden|version_conflict|request_conflict|expense_locked|expense_not_found|invalid_transition|reason_required|payment_details_required|invalid_receipt|invalid_expense|invalid_request/)?.[0]||'request_failed';return reply(origin,code==='forbidden'?403:code==='version_conflict'?409:400,{ok:false,code});}
  if(action==='accounts'){
   const userClient=client(Deno.env.get('SUPABASE_ANON_KEY')||'',token);
   const accounts=await userClient.rpc('list_admin_accounts_v4');
   if(accounts.error)return reply(origin,503,{ok:false,code:'service_unavailable'});
   return reply(origin,200,{ok:true,accounts:financeAccounts(accounts.data||[],result.data.assignments||[])});
  }
  return reply(origin,200,{ok:true,...result.data});
 }catch{return reply(origin,503,{ok:false,code:'service_unavailable'});}
});
