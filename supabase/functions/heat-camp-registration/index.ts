import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {createDecipheriv} from 'node:crypto';
import {linePayGet,linePayPost,linePayRequestPayload,linePayWebUrl} from './line-pay-api.mjs';
import {reconcileLinePay} from './line-pay-reconcile.mjs';
const APP='https://mchurch.online/heat-camp-2027.html',TEST_APP='https://mchurch.online/heat-camp-2027-test.html',SUCCESS_PAGE='https://mchurch.online/heat-camp-2027-success.html',FN='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/heat-camp-registration',MPG_VERSION='2.3';
const origins=new Set(['https://mchurch.online','https://www.mchurch.online','http://127.0.0.1:4180','http://localhost:4180']),enc=new TextEncoder(),dec=new TextDecoder();
const cors=(o:string)=>({'access-control-allow-origin':origins.has(o)?o:'https://mchurch.online','access-control-allow-headers':'content-type, apikey, authorization','access-control-allow-methods':'POST, OPTIONS','cache-control':'no-store','vary':'Origin'});
const json=(o:string,s:number,d:unknown)=>new Response(JSON.stringify(d),{status:s,headers:{...cors(o),'content-type':'application/json; charset=utf-8'}});
const db=()=>createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const hex=(b:ArrayBuffer|Uint8Array)=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
const unhex=(v:string)=>new Uint8Array(v.match(/.{1,2}/g)?.map(x=>parseInt(x,16))||[]);
const key=(v:string,u:KeyUsage[])=>crypto.subtle.importKey('raw',enc.encode(v),{name:'AES-CBC'},false,u);
const encrypt=async(v:string,k:string,i:string)=>hex(await crypto.subtle.encrypt({name:'AES-CBC',iv:enc.encode(i)},await key(k,['encrypt']),enc.encode(v)));
const decrypt=async(v:string,k:string,i:string)=>{let raw=v.trim();try{if(raw.startsWith('"')&&raw.endsWith('"'))raw=JSON.parse(raw);}catch{}try{if(raw.includes('%'))raw=decodeURIComponent(raw);}catch{}if(raw.startsWith('{'))return raw;let bytes:Uint8Array;if(/^[0-9a-f]+$/i.test(raw)&&raw.length%2===0)bytes=unhex(raw);else{const base64=raw.replaceAll(' ','+').replaceAll('-','+').replaceAll('_','/').replace(/^data:[^,]+,/,'');bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}const cipher=createDecipheriv('aes-256-cbc',enc.encode(k),enc.encode(i));cipher.setAutoPadding(false);const a=cipher.update(bytes),b=cipher.final(),plain=new Uint8Array(a.length+b.length);plain.set(a);plain.set(b,a.length);return dec.decode(plain);};
const parseGatewayJson=(value:string,stage:string)=>{
  try{return JSON.parse(value);}catch{}
  let start=0;
  while(start<value.length&&/\s/.test(value[start]))start++;
  if(value[start]!=='{'&&value[start]!=='[')throw Error(`${stage}_json_invalid`);
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<value.length;i++){
    const ch=value[i];
    if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"'){quoted=true;continue;}
    if(ch==='{'||ch==='[')depth++;
    else if(ch==='}'||ch===']'){
      depth--;
      if(depth===0){
        const suffix=value.slice(i+1);
        if(suffix.length>32||[...suffix].some(c=>c.charCodeAt(0)>32))throw Error(`${stage}_padding_invalid`);
        try{
          const parsed=JSON.parse(value.slice(start,i+1));
          if(suffix.length)console.info('heat-camp callback padding recovered',{stage,suffix_length:suffix.length});
          return parsed;
        }catch{throw Error(`${stage}_json_invalid`);}
      }
    }
  }
  throw Error(`${stage}_json_invalid`);
};
const sha=async(v:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(v))).toUpperCase();
const safe=(v:unknown,m=500)=>String(v??'').trim().slice(0,m);
const orderNo=()=>('HB27'+Date.now().toString(36)+crypto.randomUUID().replaceAll('-','').slice(0,8)).toUpperCase();
const testOrderNo=()=>('HB27T'+Date.now().toString(36)+crypto.randomUUID().replaceAll('-','').slice(0,8)).toUpperCase();
const expiry=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+259200000)).replaceAll('-','');
function config(){
  const merchantId=Deno.env.get('NEWEBPAY_MERCHANT_ID')||'';
  const hashKey=Deno.env.get('NEWEBPAY_HASH_KEY')||'',hashIv=Deno.env.get('NEWEBPAY_HASH_IV')||'';
  const environment=Deno.env.get('NEWEBPAY_ENV')||'test';
  if(!merchantId||hashKey.length!==32||hashIv.length!==16||!['test','production'].includes(environment))throw Error('payment_config_invalid');
  if(environment==='production'&&merchantId!=='MS3845446298')throw Error('payment_merchant_mismatch');
  return {merchantId,hashKey,hashIv,environment,gateway:environment==='production'?'https://core.newebpay.com/MPG/mpg_gateway':'https://ccore.newebpay.com/MPG/mpg_gateway'};
}
function checkEnvironment(c:ReturnType<typeof config>,input:any){
  const expected=safe(input.expected_environment,20);
  if((expected&&expected!==c.environment)||(c.environment==='production'&&expected!=='production'))throw Error('payment_environment_mismatch');
}
function clean(input:any){const r:Record<string,unknown>={},fields=['player_name','guardian_name','guardian_phone','email','line_id','national_id','postal_code','receipt_address','birthday','school_stage','school_name','height_cm','weight_kg','basketball_years','primary_position','dominant_hand','current_team','competition_level','jersey_size','jersey_number','jersey_name','emergency_name','emergency_phone','dietary_need','special_identity','medical_status','medical_notes','care_notes','donor_name','receipt_title','receipt_id','exception_reason','pricing_mode','payment_method','onsite_code'];for(const f of fields)r[f]=safe(input[f],f.includes('notes')?1000:f.includes('address')?220:160);r.training_goals=Array.isArray(input.training_goals)?input.training_goals.map((v:unknown)=>safe(v,30)).slice(0,10):[];for(const f of ['eligibility_exception','tax_upload_consent','public_credit','no_receipt','insurance_consent','privacy_consent','refund_consent','receipt_consent','truth_consent'])r[f]=input[f]===true;if(!r.insurance_consent||!r.privacy_consent||(!r.no_receipt&&!r.receipt_consent)||!r.refund_consent||!r.truth_consent)throw Error('consent_required');if(!['none','has'].includes(String(r.medical_status))||r.medical_status==='has'&&!r.medical_notes)throw Error('medical_status_required');return r;}
const paymentMethods:Record<string,string[]>={card:['CREDIT'],credit:['CREDIT'],webatm:['WEBATM'],atm:['VACC'],cvs:['CVS'],barcode:['BARCODE']};
const enabledProductionMethods=new Set<string>(['card','atm','barcode']);
const methodEnabled=(_c:ReturnType<typeof config>,method:string)=>enabledProductionMethods.has(method==='credit'?'card':method);
const LINE_PAY_RELEASE_READY=false; // Switch only after full sandbox payment and reconciliation acceptance.
const linePayEnabled=(c:ReturnType<typeof config>)=>LINE_PAY_RELEASE_READY&&Deno.env.get('LINE_PAY_ENABLED')==='true'
  && Deno.env.get('LINE_PAY_ENV')===c.environment
  && Boolean(Deno.env.get('LINE_PAY_CHANNEL_SECRET'));
const linePayConfig=(c:ReturnType<typeof config>)=>{
  // Closing the public checkout must not strand an already authorized order.
  if(Deno.env.get('LINE_PAY_ENV')!==c.environment||!Deno.env.get('LINE_PAY_CHANNEL_SECRET'))
    throw Error('line_pay_config_invalid');
  return {channelId:'1654237984',secret:Deno.env.get('LINE_PAY_CHANNEL_SECRET')||'',environment:c.environment};
};
const methodFlags=(c:ReturnType<typeof config>)=>({...Object.fromEntries(['card','webatm','atm','cvs','barcode'].map(method=>[method,methodEnabled(c,method)])),line_pay:linePayEnabled(c)});
const validRequestId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function linePayCheckout(origin:string,c:ReturnType<typeof config>,requestId:string,row:any,newOrderNo:string){
  if(!linePayEnabled(c))return json(origin,409,{ok:false,error:'payment_method_unavailable'});
  if(row.merchant_order_no!==newOrderNo)return json(origin,409,{ok:false,error:'payment_status_pending'});
  const claimed=await db().rpc('heat_camp_2027_claim_line_pay_order',{
    p_request_id:requestId,p_environment:c.environment,p_merchant_order_no:newOrderNo
  });
  if(claimed.error)return json(origin,409,{ok:false,error:'line_pay_order_unavailable'});
  const order=claimed.data;
  const credentials=linePayConfig(c);
  const result=await linePayPost({...credentials,path:'/v4/payments/request',
    payload:linePayRequestPayload({orderId:order.merchant_order_no,amount:order.amount,
      confirmUrl:FN+'?mode=line_confirm',cancelUrl:FN+'?mode=line_cancel'})});
  const transactionId=String(result?.transactionId||'');
  const paymentUrl=linePayWebUrl(result?.paymentUrl?.web,c.environment);
  const saved=await db().rpc('heat_camp_2027_save_line_pay_request',{
    p_merchant_order_no:order.merchant_order_no,p_transaction_id:transactionId,p_payment_url:paymentUrl
  });
  if(saved.error)throw Error('line_pay_request_not_saved');
  return json(origin,200,{ok:true,status:'checkout',registration_no:order.registration_no,redirect_url:paymentUrl});
}
const lineReturn=(state:string,registrationNo:string)=>Response.redirect(
  `${APP}?payment=${encodeURIComponent(state)}&registration=${encodeURIComponent(registrationNo)}`,303);
const reconcileOrder=(c:ReturnType<typeof config>,order:any,transactionId:string)=>
  reconcileLinePay({order,transactionId,credentials:linePayConfig(c),
    client:{get:linePayGet,post:linePayPost},database:db()});
async function linePayReturn(req:Request,mode:'line_confirm'|'line_cancel'){
  const params=new URL(req.url).searchParams;
  const transactionId=params.get('transactionId')||'',orderId=params.get('orderId')||'';
  if(!/^[0-9]{16,22}$/.test(transactionId)||!/^HB27[0-9A-Z]{10,22}$/.test(orderId))
    return lineReturn('unknown','');
  try{
    const c=config();
    const found=await db().rpc('heat_camp_2027_line_pay_order',{p_transaction_id:transactionId});
    if(found.error||!found.data||found.data.merchant_order_no!==orderId
      ||found.data.payment_environment!==c.environment)throw Error('line_pay_order_mismatch');
    const order=found.data;
    // Even a cancel redirect may race with an already captured payment. LINE's
    // signed status, never the redirect URL alone, decides the final state.
    const result=await reconcileOrder(c,order,transactionId);
    if(result==='paid')return Response.redirect(`${SUCCESS_PAGE}?registration=${encodeURIComponent(order.registration_no)}`,303);
    return lineReturn(result==='pending'||result==='awaiting_authorization'?'unknown':result,order.registration_no);
  }catch(error){
    console.error('LINE Pay return requires reconciliation',{transactionId,message:error instanceof Error?error.message:'unknown'});
    return lineReturn('unknown','');
  }
}
async function paymentGateway(origin:string,c:ReturnType<typeof config>,row:any,paymentMethod:string){
  const testFlow=row.merchant_order_no.startsWith('HB27T'),returnUrl=FN+(testFlow?'?mode=return&flow=payment-test':'?mode=return');
  const showGatewayInstructions=paymentMethod==='atm'||paymentMethod==='barcode';
  const fields:Record<string,string>={CREDIT:'0',WEBATM:'0',VACC:'0',CVS:'0',BARCODE:'0',APPLEPAY:'0',ANDROIDPAY:'0',SAMSUNGPAY:'0',MerchantID:c.merchantId,RespondType:'JSON',TimeStamp:String(Math.floor(Date.now()/1000)),Version:MPG_VERSION,LangType:'zh-tw',MerchantOrderNo:row.merchant_order_no,Amt:String(row.amount),ItemDesc:testFlow?'2027熱火籃球營金流測試':'2027熱火籃球營報名費',Email:safe(row.email,160),LoginType:'0',ExpireDate:expiry(),ReturnURL:showGatewayInstructions?'':returnUrl,NotifyURL:FN+'?mode=notify',CustomerURL:showGatewayInstructions?'':returnUrl};
  for(const field of paymentMethods[paymentMethod])fields[field]='1';
  const tradeInfo=await encrypt(new URLSearchParams(fields).toString(),c.hashKey,c.hashIv),tradeSha=await sha(`HashKey=${c.hashKey}&${tradeInfo}&HashIV=${c.hashIv}`);
  return json(origin,200,{ok:true,status:'checkout',registration_no:row.registration_no,gateway:c.gateway,fields:{MerchantID:c.merchantId,TradeInfo:tradeInfo,TradeSha:tradeSha,Version:MPG_VERSION}});
}
async function retryContext(requestId:string){
  const result=await db().rpc('heat_camp_2027_retry_context',{p_request_id:requestId});
  if(result.error)throw Error('retry_status_unavailable');
  return result.data;
}
async function registrationStatus(origin:string,input:any){
  const requestId=safe(input.request_id,36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return json(origin,400,{ok:false,error:'invalid_request_id'});
  try{
    const c=config();checkEnvironment(c,input);
    let row=await retryContext(requestId);
    if(!row||row.payment_environment!==c.environment)return json(origin,404,{ok:false,error:'registration_not_found'});
    let verificationPending=false;
    let resumeUrl='';
    if(row.payment_provider==='line_pay'&&row.order_status==='created'&&row.transaction_id){
      try{
        const result=await reconcileOrder(c,{status:row.order_status,merchant_order_no:row.merchant_order_no,amount:row.amount},row.transaction_id);
        row=await retryContext(requestId);
        if(result==='awaiting_authorization'&&row.status==='awaiting_payment'&&row.order_status==='created'&&row.payment_url)
          resumeUrl=linePayWebUrl(row.payment_url,c.environment);
      }catch(error){
        verificationPending=true;
        console.error('LINE Pay status reconciliation pending',{registrationNo:row.registration_no,message:error instanceof Error?error.message:'unknown'});
      }
    }
    return json(origin,200,{ok:true,registration_no:row.registration_no,status:row.status,amount:row.amount,order_status:row.order_status,verification_pending:verificationPending,resume_url:resumeUrl,retry_allowed:!verificationPending&&row.status==='awaiting_payment'&&['failed','expired','cancelled'].includes(row.order_status)});
  }catch{return json(origin,503,{ok:false,error:'retry_status_unavailable'});}
}
async function retryPayment(origin:string,input:any){
  const requestId=safe(input.request_id,36),paymentMethod=safe(input.payment_method,20);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return json(origin,400,{ok:false,error:'invalid_request_id'});
  if(!paymentMethods[paymentMethod]&&paymentMethod!=='line_pay')return json(origin,400,{ok:false,error:'payment_method_unavailable'});
  try{
    const c=config();checkEnvironment(c,input);
    if(paymentMethod==='line_pay'?!linePayEnabled(c):!methodEnabled(c,paymentMethod))return json(origin,409,{ok:false,error:'payment_method_unavailable'});
    const row=await retryContext(requestId);
    if(!row||row.payment_environment!==c.environment)return json(origin,404,{ok:false,error:'registration_not_found'});
    if(row.status==='paid'||row.order_status==='paid')return json(origin,200,{ok:true,status:'paid',registration_no:row.registration_no});
    if(row.status!=='awaiting_payment'||!['failed','expired','cancelled'].includes(row.order_status))return json(origin,409,{ok:false,error:'payment_status_pending'});
    const newOrderNo=orderNo();
    const prepared=await db().rpc('heat_camp_2027_prepare_checkout',{
      p_request_id:requestId,p_environment:c.environment,p_merchant_order_no:newOrderNo
    });
    if(prepared.error)return json(origin,409,{ok:false,error:'payment_retry_unavailable'});
    if(prepared.data?.status==='paid')return json(origin,200,{ok:true,status:'paid',registration_no:row.registration_no});
    if(prepared.data?.merchant_order_no!==newOrderNo)return json(origin,409,{ok:false,error:'payment_status_pending'});
    if(paymentMethod==='line_pay')return linePayCheckout(origin,c,requestId,prepared.data,newOrderNo);
    return paymentGateway(origin,c,prepared.data,paymentMethod);
  }catch(e){
    console.error('heat-camp payment retry failed',{message:e instanceof Error?e.message:'retry_failed'});
    return json(origin,503,{ok:false,error:'payment_retry_unavailable'});
  }
}
async function completeOnsiteRegistration(origin:string,input:any){
  try{
    const environment=Deno.env.get('NEWEBPAY_ENV')||'test';
    if(!['test','production'].includes(environment)||safe(input.expected_environment,20)!==environment)
      return json(origin,409,{ok:false,error:'payment_environment_mismatch'});
    const requestId=safe(input.request_id,36),registration=clean(input.registration||{});
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      return json(origin,400,{ok:false,error:'invalid_request_id'});
    if(registration.pricing_mode!=='onsite')return json(origin,400,{ok:false,error:'onsite_verification_failed'});
    registration.payment_environment=environment;
    const created=await db().rpc('heat_camp_2027_create_registration',{
      p_request_id:requestId,p_payload:registration,p_merchant_order_no:orderNo()
    });
    if(created.error){
      const error=created.error.message?.match(/(onsite_verification_failed|onsite_code_used|request_registration_mismatch|payment_environment_mismatch|registration_closed|camp_full|jersey_or_order_unavailable|invalid_[a-z_]+|encryption_unavailable)/)?.[1]||'onsite_verification_failed';
      return json(origin,409,{ok:false,error});
    }
    if(created.data?.status!=='paid')return json(origin,409,{ok:false,error:'onsite_verification_failed'});
    return json(origin,200,{ok:true,status:'onsite_complete',registration_no:created.data.registration_no});
  }catch(e){
    return json(origin,400,{ok:false,error:e instanceof Error?e.message:'registration_failed'});
  }
}

async function checkout(origin:string,input:any){
  try{
    const c=config();checkEnvironment(c,input);
    const requestId=safe(input.request_id,36),registration=clean(input.registration||{}),paymentMethod=safe(registration.payment_method,20)||'atm';
    const methods:Record<string,string[]>={card:['CREDIT','APPLEPAY','ANDROIDPAY','SAMSUNGPAY'],credit:['CREDIT','APPLEPAY','ANDROIDPAY','SAMSUNGPAY'],webatm:['WEBATM'],atm:['VACC'],cvs:['CVS'],barcode:['BARCODE']};
    if(!/^[0-9a-f-]{36}$/i.test(requestId))return json(origin,400,{ok:false,error:'invalid_request_id'});
    if(paymentMethod==='line_pay'?!linePayEnabled(c):(!methods[paymentMethod]||!methodEnabled(c,paymentMethod)))
      return json(origin,409,{ok:false,error:'payment_method_unavailable'});
    registration.payment_environment=c.environment;

    const newOrderNo=orderNo();
    const created=await db().rpc('heat_camp_2027_create_registration',{p_request_id:requestId,p_payload:registration,p_merchant_order_no:newOrderNo});
    const createError=created.error?.message?.match(/(request_registration_mismatch|payment_environment_mismatch|registration_closed|pricing_mode_not_ready|price_unavailable|invalid_[a-z_]+|camp_full|jersey_or_order_unavailable|encryption_unavailable)/)?.[1]||'';
    if(created.data?.status==='exception_review')return json(origin,200,{ok:true,status:created.data.status,registration_no:created.data.registration_no});

    if(created.error)return json(origin,409,{ok:false,error:createError||'registration_failed'});
    const prepared=await db().rpc('heat_camp_2027_prepare_checkout',{
      p_request_id:requestId,p_environment:c.environment,p_merchant_order_no:newOrderNo
    });
    if(prepared.error){
      console.error('heat-camp payment preparation failed',{createError:createError||created.error?.message||'',prepareError:prepared.error.message||''});
      return json(origin,409,{ok:false,error:createError||'payment_retry_unavailable'});
    }
    const row=prepared.data;
    if(row.status==='paid')return json(origin,200,{ok:true,status:'paid',registration_no:row.registration_no});
    if(registration.no_receipt){
      const receipt=await db().rpc('heat_camp_2027_set_no_receipt',{p_registration_id:row.id});
      if(receipt.error)return json(origin,409,{ok:false,error:'receipt_preference_failed'});
    }

    if(paymentMethod==='line_pay')return linePayCheckout(origin,c,requestId,row,newOrderNo);
    return paymentGateway(origin,c,row,paymentMethod);
  }catch(e){
    return json(origin,400,{ok:false,error:e instanceof Error?e.message:'registration_failed'});
  }
}
async function paymentTestCheckout(origin:string,input:any){
  const c=config();
  if(c.environment!=='production'||safe(input.expected_environment,20)!=='production')return json(origin,409,{ok:false,error:'payment_environment_mismatch'});
  const requestId=safe(input.request_id,36),password=safe(input.password,160),email=safe(input.email,160).toLowerCase(),method=safe(input.payment_method,20),amount=Number(input.amount);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return json(origin,400,{ok:false,error:'invalid_request_id'});
  if(!['card','atm','barcode'].includes(method)||!methodEnabled(c,method))return json(origin,409,{ok:false,error:'payment_method_unavailable'});
  const created=await db().rpc('heat_camp_2027_create_payment_test_order',{
    p_request_id:requestId,p_password:password,p_email:email,p_payment_method:method,p_amount:amount,p_merchant_order_no:testOrderNo()
  });
  if(created.error){
    const error=created.error.message?.match(/(payment_test_password_invalid|payment_test_request_mismatch|invalid_payment_test_request)/)?.[1]||'payment_test_unavailable';
    return json(origin,409,{ok:false,error});
  }
  if(created.data?.status!=='created')return json(origin,409,{ok:false,error:'payment_test_order_already_started'});
  return paymentGateway(origin,c,created.data,method);
}
async function paymentTestDashboard(origin:string,input:any){
  const c=config();
  if(c.environment!=='production')return json(origin,409,{ok:false,error:'payment_environment_mismatch'});
  const password=safe(input.password,160);
  const [login,orders]=await Promise.all([
    db().rpc('heat_camp_2027_payment_test_login',{p_password:password}),
    db().rpc('heat_camp_2027_payment_test_orders',{p_password:password})
  ]);
  if(login.error||orders.error)return json(origin,401,{ok:false,error:'payment_test_password_invalid'});
  return json(origin,200,{ok:true,methods:Object.fromEntries(Object.entries(login.data.methods).filter(([method])=>methodEnabled(c,method))),orders:orders.data});
}
async function callback(req:Request,mode:string){
  const c=config(),back=c.environment==='production'?APP:TEST_APP;
  let testOrder=new URL(req.url).searchParams.get('flow')==='payment-test';
  try{
    const form=await req.formData(),ti=safe(form.get('TradeInfo'),20000),ts=safe(form.get('TradeSha'),128),plainStatus=safe(form.get('Status'),40),plainMessage=safe(form.get('Message'),300);
    if(!ti||!ts){if(plainStatus||plainMessage)throw Error(`${plainStatus||'gateway_error'}:${plainMessage||'藍新未回傳交易資料'}`);throw Error('missing_trade_response');}
    if(await sha(`HashKey=${c.hashKey}&${ti}&HashIV=${c.hashIv}`)!==ts.toUpperCase())throw Error('signature_invalid');
    const data=parseGatewayJson(await decrypt(ti,c.hashKey,c.hashIv),'trade_info'),result=typeof data.Result==='string'?parseGatewayJson(data.Result,'result'):data.Result||{};
    if(result.MerchantID!==c.merchantId)throw Error('merchant_mismatch');
    const order=safe(result.MerchantOrderNo,40);
    testOrder=order.startsWith('HB27T');
    const success=data.Status==='SUCCESS',type=safe(result.PaymentType,40),paid=success&&(type.startsWith('CREDIT')||Boolean(result.PayTime));
    const saved=await db().rpc(testOrder?'heat_camp_2027_record_payment_test':'heat_camp_2027_record_payment',{
      p_merchant_order_no:order,p_trade_no:safe(result.TradeNo,40),p_paid:paid,
      p_result:{...result,Status:data.Status,Message:data.Message,_environment:c.environment}
    });
    if(saved.error)throw Error(saved.error.message||'record_failed');
    if(mode==='notify')return new Response('1|OK',{headers:{'content-type':'text/plain; charset=utf-8'}});
    const effectivePaid=paid||saved.data.status==='paid';
    const codeIssued=Boolean(result.CodeNo||result.VaccNo||result.Barcode_1||result.Barcode_2||result.Barcode_3);
    const state=effectivePaid?'paid':success&&codeIssued?'account-issued':success?'unknown':'failed';
    const target=testOrder
      ?`https://mchurch.online/heat-camp-payment-test.html?payment=${state}&order=${encodeURIComponent(order)}`
      :effectivePaid?`${SUCCESS_PAGE}?registration=${encodeURIComponent(saved.data.registration_no||'')}`
        :`${back}?payment=${state}&registration=${encodeURIComponent(saved.data.registration_no||'')}&code=${encodeURIComponent(safe(data.Status,40))}&message=${encodeURIComponent(safe(data.Message,300))}`;
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><script>location.replace(${JSON.stringify(target)})<\/script><a href="${target}">返回報名頁</a>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }catch(e){
    const message=e instanceof Error?e.message:'callback_error';console.error('heat-camp payment callback failed',{mode,message});
    if(mode==='notify')return new Response('0|ERROR',{status:400});
    return Response.redirect(`${testOrder?'https://mchurch.online/heat-camp-payment-test.html':back}?payment=unknown&message=${encodeURIComponent(message)}`,303);
  }
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'',mode=new URL(req.url).searchParams.get('mode')||'';
  if(mode==='notify'||mode==='return')return req.method==='POST'?callback(req,mode):new Response('method_not_allowed',{status:405});
  if(mode==='line_confirm'||mode==='line_cancel')
    return req.method==='GET'?linePayReturn(req,mode):new Response('method_not_allowed',{status:405});
  if(req.method==='OPTIONS')return origins.has(origin)?new Response('ok',{headers:cors(origin)}):json(origin,403,{ok:false,error:'forbidden'});
  if(req.method!=='POST'||!origins.has(origin))return json(origin,403,{ok:false,error:'forbidden'});
  const body=await req.json().catch(()=>null);
  if(!body)return json(origin,400,{ok:false,error:'invalid_request'});
  try{
    if(body.action==='configuration_status'){
      const c=config();
      return json(origin,200,{ok:true,configured:true,environment:c.environment,merchant_suffix:c.merchantId.slice(-4),merchant_id:c.merchantId,payment_methods:methodFlags(c)});
    }
    if(body.action==='jersey_availability'){
      const c=config(),environment=safe(body.expected_environment,20)||c.environment;
      if(!['test','production'].includes(environment))return json(origin,400,{ok:false,error:'invalid_environment'});
      const r=await db().rpc('heat_camp_2027_available_jersey_numbers',{p_environment:environment});
      return r.error?json(origin,503,{ok:false,error:'unavailable'}):json(origin,200,{ok:true,numbers:(r.data||[]).map((x:{jersey_number:number})=>x.jersey_number)});
    }
    if(body.action==='payment_test_checkout')return paymentTestCheckout(origin,body);
    if(body.action==='payment_test_dashboard')return paymentTestDashboard(origin,body);
    if(body.action==='complete_onsite_registration')return completeOnsiteRegistration(origin,body);
    if(body.action==='create_checkout')return checkout(origin,body);
    if(body.action==='registration_status')return registrationStatus(origin,body);
    if(body.action==='retry_payment')return retryPayment(origin,body);
    return json(origin,400,{ok:false,error:'invalid_request'});
  }catch(e){
    return json(origin,503,{ok:false,error:e instanceof Error?e.message:'payment_service_unavailable'});
  }
});
