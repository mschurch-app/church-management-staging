import {notificationText,EMAIL} from './validation.mjs';
export async function deliver(job,{lineToken,fetcher=fetch,sendMail,from}){
 const text=notificationText(job);
 if(job.channel==='line'){
  if(!/^U[0-9a-f]{32}$/.test(job.recipient||''))return {status:'failed',error_code:'identity_missing'};
  if(!lineToken)return {status:'retry',error_code:'line_not_configured'};
  if(Date.now()-Date.parse(job.created_at)>23*3600000&&job.attempts>1)return {status:'unknown',error_code:'line_retry_window_expired'};
  try{
   const r=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+lineToken,'content-type':'application/json','X-Line-Retry-Key':job.id},body:JSON.stringify({to:job.recipient,messages:[{type:'text',text}]})});
   const accepted=r.headers.get('x-line-accepted-request-id');
   return r.ok||(r.status===409&&accepted)?{status:'sent',provider_id:accepted||r.headers.get('x-line-request-id')}:{status:r.status===429||r.status>=500?'retry':'failed',error_code:'line_http_'+r.status};
  }catch{return {status:'retry',error_code:'line_network_unavailable'};}
 }
 if(job.channel!=='email'||!EMAIL.test(job.recipient||''))return {status:'failed',error_code:'email_invalid'};
 if(!sendMail||!EMAIL.test(from||''))return {status:'retry',error_code:'smtp_not_configured'};
 try{
  const result=await sendMail({from:{name:'M+ 大雅教會｜奉獻回報',address:from},to:job.recipient,subject:`${job.is_test?'【測試】':''}感恩節奉獻回報 ${job.reference_no}`,text,messageId:`<${job.id}@mchurch.online>`,disableFileAccess:true,disableUrlAccess:true});
  if(!result.accepted?.includes(job.recipient))return {status:'failed',error_code:'smtp_recipient_rejected'};
  return {status:'sent',provider_id:result.messageId||job.id};
 }catch(error){
  const code=String(error?.code||'');
  // A disconnect after DATA may mean the mail was accepted. Require manual investigation.
  if(['EDNS','ECONNREFUSED','EAUTH','ETLS'].includes(code)||error?.command==='CONN'||error?.command==='AUTH')return {status:code==='EAUTH'?'failed':'retry',error_code:'smtp_'+(code||'connect_failed').toLowerCase()};
  if(error?.responseCode>=500)return {status:'failed',error_code:'smtp_rejected_'+error.responseCode};
  if(error?.responseCode>=400)return {status:'retry',error_code:'smtp_temporary_'+error.responseCode};
  return {status:'unknown',error_code:'smtp_acceptance_unknown'};
 }
}
export async function dispatchJobs({rpc,workerKey,...dependencies}){
 const {jobs}=await rpc('claim_jobs',{worker_key:workerKey});let processed=0;const counts={sent:0,retry:0,failed:0,unknown:0};
 for(const job of jobs){
  const result=await deliver(job,dependencies);
  await rpc('finish_job',{worker_key:workerKey,id:job.id,lease_token:job.lease_token,...result});processed++;counts[result.status]++;
 }
 return {ok:true,processed,...counts};
}
