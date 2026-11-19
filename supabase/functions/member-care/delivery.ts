export async function dispatchMemberCare({db,token,fetcher=fetch}:any){
 if(!token)return {ok:false,error:'line_not_configured'};
 const q=await db.rpc('member_care_claim_deliveries');if(q.error||q.data?.ok!==true)return {ok:false,error:'queue_unavailable'};
 const verified=new Map(),counts:any={accepted:0,retryable:0,failed:0,unconfirmed:0};
 for(const item of q.data.items||[]){let status='retryable',code='line_unconfirmed',requestId=null;
 try{if(!/^C[0-9a-f]{32}$/.test(item.group_id||'')){status='failed';code='group_not_configured';}
 else{if(!verified.has(item.group_id)){const r=await fetcher('https://api.line.me/v2/bot/group/'+item.group_id+'/summary',{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('group_lookup_unavailable');const group=await r.json();verified.set(item.group_id,group.groupId===item.group_id&&typeof group.groupName==='string'&&group.groupName.normalize('NFKC').includes('青年'));}
 if(!verified.get(item.group_id)){status='failed';code='youth_group_not_verified';}
 else if(item.audience==='pastoral'&&!/^https:\/\/mscos\.mchurch\.online\/prayers\.html\?church=M%2B&prayer_id=[0-9]+$/.test(item.message)){status='failed';code='private_payload_rejected';}
 else{const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+token,'content-type':'application/json','X-Line-Retry-Key':item.id},body:JSON.stringify({to:item.group_id,messages:[{type:'text',text:item.message}]})});requestId=response.headers.get('x-line-accepted-request-id')||response.headers.get('x-line-request-id');if(response.ok||(response.status===409&&response.headers.get('x-line-accepted-request-id'))){status='accepted';code=null;}else{status=response.status>=500||response.status===429?'retryable':'failed';code='line_http_'+response.status;}}}}
 catch{status='retryable';code='line_unconfirmed';}
 const result=await db.rpc('member_care_finish_delivery',{p_id:item.id,p_lease:item.lease_id,p_status:status,p_provider:requestId,p_error:code});if(result.error||result.data!==true)counts.unconfirmed++;else counts[status]++;
 }return {ok:true,...counts};
}
