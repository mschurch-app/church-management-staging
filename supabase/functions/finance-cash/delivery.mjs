const APP='https://mscos.mchurch.online';
export function counterInvitation(item){
 const totals=Object.entries(item.category_totals||{}).map(([category,amount])=>`${category}：${Number(amount).toLocaleString('zh-TW')} 元`).join('\n');
 return `主日奉獻已送審，邀請您閱覽補勾\n日期：${item.offering_date}\n奉獻合計：${Number(item.total).toLocaleString('zh-TW')} 元，共 ${item.bag_count} 筆\n${totals}\n已有一位點收同工確認，審核正常進行。請登入自己的帳號閱覽完整明細，勾選您的整批點收確認；補勾不影響師母、牧師審核。\n${APP}/finance-cash.html?church=M%2B&batch=${encodeURIComponent(item.batch_id)}`;
}
export async function deliverCounterInvitation({db,item,lineToken,fetcher=fetch}){
 const batch=await db.from('finance_cash_batches').select('status,counter_1,counter_2,counter_1_confirmed_at,counter_2_confirmed_at').eq('id',item.batch_id).maybeSingle();
 if(batch.error)throw Error('batch_read_failed');
 const b=batch.data,n=b?.counter_1===item.recipient_user_id?1:b?.counter_2===item.recipient_user_id?2:0;
 if(!b||!n||['draft','returned'].includes(b.status)||b[`counter_${n}_confirmed_at`])return {status:'cancelled',last_error:'confirmation_no_longer_required'};
 // Canonical IDs match the finance identity; permission is rechecked at delivery.
 const latest=await db.from('finance_cash_events').select('version').eq('batch_id',item.batch_id).eq('action','submitted').order('version',{ascending:false}).limit(1);
 if(latest.error)throw Error('submission_read_failed');
 if(latest.data?.[0]?.version!==item.submitted_version)return {status:'cancelled',last_error:'submission_superseded'};
 const allowed=await db.rpc('finance_user_can',{p_user:item.recipient_user_id,p_role:'entry'});
 if(allowed.error)throw Error('permission_read_failed');
 if(allowed.data!==true)return {status:'cancelled',last_error:'recipient_not_authorized'};
 let subject=item.recipient_line_subject;
 if(!subject){
 const person=await db.from('pastoral_staff').select('line_subject').eq('app_user_id',item.recipient_user_id).eq('is_active',true).not('line_subject','is',null).limit(2);
 if(person.error)throw Error('identity_read_failed');
 const subjects=[...new Set((person.data||[]).map(p=>p.line_subject).filter(s=>/^U[0-9a-f]{32}$/i.test(s||'')))];
 if(subjects.length!==1)throw Error('identity_missing_or_ambiguous');
 subject=subjects[0];
 const stored=await db.from('finance_cash_confirmation_notifications').update({recipient_line_subject:subject}).eq('id',item.id);
 if(stored.error)throw Error('identity_write_failed');
 }
 if(!lineToken)throw Error('line_not_configured');
 const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${lineToken}`,'content-type':'application/json','X-Line-Retry-Key':item.id},body:JSON.stringify({to:subject,messages:[{type:'text',text:counterInvitation(item)}]})});
 if(!response.ok&&!(response.status===409&&response.headers.get('x-line-accepted-request-id')))throw Error('line_http_'+response.status);
 return {status:'sent',last_error:null,sent_at:new Date().toISOString()};
}
export async function deliverPendingCounterInvitations(db,lineToken,batchId=null){
 let query=db.from('finance_cash_confirmation_notifications').select('*').in('status',['pending','failed','processing']).lt('attempt_count',5).order('created_at').limit(5);
 if(batchId)query=query.eq('batch_id',batchId);
 const due=await query;if(due.error)throw Error('queue_read_failed');let sent=0,failed=0;
 for(const item of due.data||[]){
  if(item.attempt_count>0&&Date.now()-Date.parse(item.created_at)>23*60*60*1000){await db.from('finance_cash_confirmation_notifications').update({status:'cancelled',last_error:'retry_window_expired'}).eq('id',item.id);continue;}
  if(item.status==='processing'&&Date.now()-Date.parse(item.updated_at)<120000)continue;
  const now=new Date().toISOString();
  const claim=await db.from('finance_cash_confirmation_notifications').update({status:'processing',attempt_count:item.attempt_count+1,updated_at:now}).eq('id',item.id).eq('status',item.status).eq('updated_at',item.updated_at).select('id').maybeSingle();
  if(claim.error||!claim.data)continue;
  try{const result=await deliverCounterInvitation({db,item,lineToken});const stored=await db.from('finance_cash_confirmation_notifications').update({...result,updated_at:new Date().toISOString()}).eq('id',item.id);if(stored.error)throw Error('result_write_failed');if(result.status==='sent')sent++;}
  catch(error){failed++;await db.from('finance_cash_confirmation_notifications').update({status:'failed',last_error:error.message,updated_at:new Date().toISOString()}).eq('id',item.id);}
 }
 return {sent,failed};
}
