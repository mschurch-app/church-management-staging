const APP='https://mscos.mchurch.online';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function reviewLink(submissionId){if(!UUID.test(String(submissionId)))throw Error('invalid_submission');return APP+'/testimony-admin.html?church=M%2B&submission='+submissionId;}
export async function deliverTestimonyReview({item,lineSubject,lineToken,fetcher=fetch}){
 if(!UUID.test(String(item.id))||!['receipt','initial','final'].includes(item.stage))throw Error('invalid_queue_item');
 if(!/^U[0-9a-f]{32}$/i.test(lineSubject||''))return {status:'failed',error:'line_identity_missing'};
 if(!lineToken)return {status:'failed',error:'line_token_missing'};
 const text=(item.stage==='receipt'?'雲彩見證｜收到新投稿\n有一篇新投稿待初審，可由下方連結查看內容與審核進度。':item.stage==='initial'?'雲彩見證｜新投稿待初審\n有一篇新投稿，請登入教會 OS 完成初審。':'雲彩見證｜初審完成，待複審\n初審同工已完成初審，請師母或牧師登入教會 OS 核對並複審。')+'\n'+reviewLink(item.submission_id);
 try{
  const response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+lineToken,'content-type':'application/json','X-Line-Retry-Key':item.id},body:JSON.stringify({to:lineSubject,messages:[{type:'text',text}]})});
  const accepted=response.headers.get('x-line-accepted-request-id');
  return response.ok||(response.status===409&&Boolean(accepted))?{status:'sent'}:{status:'failed',error:'line_http_'+response.status};
 }catch{return {status:'failed',error:'line_unconfirmed'};}
}
