import webpush from 'npm:web-push@3.6.7';

async function vapid(db){
 const stored=await db.rpc('get_app_push_vapid_config');
 if(stored.error||!stored.data?.public_key||!stored.data?.private_key)return null;
 webpush.setVapidDetails(stored.data.subject||'mailto:james@tcsc.org.tw',stored.data.public_key,stored.data.private_key);
 return true;
}

export async function notifyNewcomerApp({db,memberId}){
 const member=await db.from('members').select('id,name,church_id,faith_status,archived_at').eq('id',memberId).eq('church_id','M+').maybeSingle();
 if(member.error||!member.data||member.data.archived_at||member.data.faith_status!=='新朋友（初次聚會）')return {status:'skipped'};
 const recipients=await db.rpc('get_app_push_recipient_users',{p_church:'M+',p_permission:'members'});
 if(recipients.error||!Array.isArray(recipients.data))return {status:'failed'};
 const title='M+ 有新朋友登記';
 const body=`${member.data.name||'新朋友'} 已完成資料登記，請同工持續關心。`;
 const url=`/newcomer-care.html?church=M%2B&member=${memberId}`;
 const sourceKey=`mplus-newcomer:${memberId}`;
 const ready=await vapid(db);
 let sent=0;
 for(const userId of recipients.data){
  const previous=await db.from('app_notifications').select('id').eq('user_id',userId).eq('event_key','newcomer_created').eq('source_key',sourceKey).maybeSingle();
  if(!previous.data)await db.from('app_notifications').insert({user_id:userId,church_id:'M+',event_key:'newcomer_created',source_key:sourceKey,title,body,target_url:url});
  if(!ready)continue;
  const subscriptions=await db.from('app_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',userId).eq('is_active',true);
  for(const item of subscriptions.data||[])try{
   await webpush.sendNotification({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth_key}},JSON.stringify({title,body,url,tag:sourceKey}));sent++;
  }catch(error){const status=Number(error?.statusCode||0);if(status===404||status===410)await db.from('app_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',item.id);}
 }
 return {status:sent?'sent':'stored',sent};
}

