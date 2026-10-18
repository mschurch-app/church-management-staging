const APP='https://mscos.mchurch.online';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deliverReviewChannels({db,item,previous={},notifyApp,fetcher=fetch,lineToken=''}) {
 const result=await db.from('notification_channel_routes').select('app_enabled,line_enabled').eq('church_id','M+').eq('event_key','sermon_social_review').maybeSingle();
 if(result.error)throw new Error('notification_route_read_failed');
 const route=result.data||{app_enabled:true,line_enabled:true};
 const pastorStatusCopy=String(item.source_key||'').startsWith('sermon-social-initial-status:');
 const appEnabled=route.app_enabled!==false;
 const lineEnabled=route.line_enabled!==false&&item.stage==='initial_review'&&!pastorStatusCopy;
 let appStatus=previous.app_status==='sent'?'sent':appEnabled?null:'disabled';
 let lineStatus=previous.line_status==='sent'?'sent':lineEnabled?null:'disabled';
 if(appStatus===null) {
  const app=await notifyApp({db,staffId:item.staff_id,churchId:'M+',eventKey:'sermon_social_review',sourceKey:item.source_key,title:item.title,body:item.body,url:item.target_url});
  appStatus=['sent','stored'].includes(app.status)?'sent':app.status;
 }
 let lineRequestId=null;
 if(lineStatus===null) {
  const person=await db.from('pastoral_staff').select('line_subject,is_active').eq('id',item.staff_id).eq('is_active',true).maybeSingle();
  if(person.error)lineStatus='identity_read_failed';
  else if(!/^U[0-9a-f]{32}$/i.test(person.data?.line_subject||''))lineStatus='identity_missing';
  else if(!lineToken)lineStatus='not_configured';
  else {
   const target=new URL(item.target_url,APP);
   if(target.origin!==APP||!UUID.test(String(item.id)))throw new Error('invalid_notification_target');
   try {
    const response=await fetcher('https://api.line.me/v2/bot/message/push',{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
     headers:{authorization:'Bearer '+lineToken,'content-type':'application/json','X-Line-Retry-Key':item.id},
     body:JSON.stringify({to:person.data.line_subject,messages:[{type:'text',text:item.title+'\n'+item.body+'\n'+target.href}]})
    });
    const accepted=response.headers.get('x-line-accepted-request-id');
    lineStatus=response.ok||(response.status===409&&Boolean(accepted))?'sent':'http_'+response.status;
    lineRequestId=accepted||response.headers.get('x-line-request-id');
   } catch {lineStatus='unavailable';}
  }
 }
 const complete=['sent','disabled'].includes(appStatus)&&['sent','disabled'].includes(lineStatus);
 return {appStatus,lineStatus,lineRequestId,complete,pastorStatusCopy};
}

