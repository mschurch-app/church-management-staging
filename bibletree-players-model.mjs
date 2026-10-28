export function dateLabel(value){if(!value)return '尚無紀錄';const date=new Date(value);return Number.isNaN(date.getTime())?'尚無紀錄':new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(date);}
export function churchLabel(player){return player.church_status==='none'?'目前沒有固定教會':player.church_name||'未填寫';}
export function avatarLabel(id){const match=/^(male|female)-([123])$/.exec(id||'');return match?`${match[1]==='male'?'男':'女'}角色 · 配色 ${match[2]}`:'尚未選角';}
export function rewardLabel(player){
 const robe=player.robe_claimed_at?'長老服：已領取':player.beta_first_seen_at?'長老服：正式開放後可領取':'未登記公測資格';
 let boost='';if(player.feedback_count>0){boost=player.boost_expires_at?`雙倍經驗：${dateLabel(player.boost_started_at)} 至 ${dateLabel(player.boost_expires_at)}`:'雙倍經驗：正式開放後首次登入起算 72 小時';}
 return [robe,boost].filter(Boolean).join('；');
}
export function validateResult(result){
 if(result?.ok!==true||!Array.isArray(result.players)||!Number.isSafeInteger(result.total)||result.total<0||!result.stats||!Number.isSafeInteger(result.offset)||result.offset<0||result.limit!==25)throw Error('玩家資料回應不完整，請重新載入。');
 return result;
}
