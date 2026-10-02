function phoneTail(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits.length>=3?digits.slice(-3):'未提供';
}

export async function notifyBindingReview({client,requestId,church,name,phone,fetcher=fetch,token=church==='SHiNE'?(Deno.env.get('LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||''):(Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'')}){
  const configured=await client.from('line_notification_settings').select('enabled,recipient_staff_ids,group_id').eq('church_id',church).eq('event_key','binding_review').maybeSingle();
  if(configured.error||configured.data?.enabled===false)return {status:'disabled',sent:0,total:0};
  const recipientIds=configured.data?.recipient_staff_ids||[];
  const {data:staff,error}=await client.from('pastoral_staff')
    .select('id,display_name,line_subject,is_active')
    .in('id',recipientIds.length?recipientIds:['00000000-0000-0000-0000-000000000000'])
    .eq('is_active',true);
  if(error)return {status:'lookup_failed',sent:0,total:recipientIds.length};
  let sent=0;
  for(const person of staff||[]){
    const key=`member-binding-review:${requestId}:${person.id}`;
    const previous=await client.from('pastoral_notification_deliveries').select('status').eq('idempotency_key',key).maybeSingle();
    if(previous.data?.status==='sent'){sent+=1;continue;}
    let status='failed',errorCode=null;
    if(!token)errorCode='line_token_missing';
    else if(!/^U[0-9a-f]{32}$/i.test(person.line_subject||''))errorCode='line_identity_missing';
    else try{
      const response=await fetcher('https://api.line.me/v2/bot/message/push',{
        method:'POST',signal:AbortSignal.timeout(8000),
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({to:person.line_subject,messages:[{type:'text',text:`有新的 LINE 會友綁定申請\n申請人：${String(name||'未提供').trim()}\n手機末三碼：${phoneTail(phone)}\n請至管理平台審核：\nhttps://mscos.mchurch.online/binding-review.html?church=${encodeURIComponent(church)}`}]})
      });
      if(response.ok){status='sent';sent+=1;}else errorCode=`line_http_${response.status}`;
    }catch{errorCode='line_unavailable';}
    await client.from('pastoral_notification_deliveries').upsert({
      entity_key:church==='M+'?'mplus':'shine',notification_type:'member_binding_review',
      recipient_staff_id:person.id,related_id:requestId,idempotency_key:key,status,error_code:errorCode,
      sent_at:status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()
    },{onConflict:'idempotency_key'});
  }
  const groupId=configured.data?.group_id||'';
  if(token&&/^C[0-9a-f]{32}$/i.test(groupId)){
    const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:groupId,messages:[{type:'text',text:`有新的 LINE 會友綁定申請\n申請人：${String(name||'未提供').trim()}\n手機末三碼：${phoneTail(phone)}\n請至管理平台審核：\nhttps://mscos.mchurch.online/binding-review.html?church=${encodeURIComponent(church)}`}]})});
    if(response.ok)sent++;
  }
  const total=(staff||[]).length+(groupId?1:0);
  return {status:sent===total&&total?'sent':sent?'partial':'failed',sent,total};
}
