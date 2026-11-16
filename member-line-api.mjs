const errors={forbidden:'你目前沒有這項 LINE 操作權限，請聯絡系統管理者。',login_required:'登入已失效，請重新登入。',session_revoked:'登入已失效，請重新登入。',unsupported_church:'此傳送管道目前支援 M+ 大雅教會。',line_unavailable:'這位會友尚未完成唯一的 LINE 綁定，無法傳送。',binding_changed:'會友的 LINE 綁定已改變，請重新開啟資料確認。',member_unavailable:'會友資料已封存或無法使用，請重新查詢。',version_conflict:'其他管理者已更新此開關，請重新載入後確認。',delivery_busy:'訊息正在傳送中，請稍候再查詢結果。',duplicate_message:'相同訊息已有傳送紀錄，請先查看最近紀錄，避免重複傳送。',request_reused:'這次傳送的內容已改變，請重新開啟並確認。',retry_expired:'已超過安全重試期限，請先核對傳送紀錄。',delivery_failed:'LINE 已拒絕這次訊息，請聯絡管理者確認。',channel_unavailable:'LINE 傳送管道尚未設定。',account_inactive:'此同工帳號已停用，無法開放傳送。'};
export async function memberLineCall(db,action,data={}){
 const {data:result,error}=await db.functions.invoke('member-line-message',{body:{action,church:'M+',...data}});
 let code=result?.error;if(error?.context?.clone)try{code=(await error.context.clone().json()).error;}catch{}
 if(error||!result?.ok)throw Error(errors[code]||'目前無法確認操作結果，請保留內容並重試查詢，勿重複建立新訊息。');return result;
}
export const deliveryLabel=status=>({accepted:'LINE 已受理',sending:'傳送中，待確認',retryable:'結果待確認，可使用原訊息重試',failed:'LINE 拒絕傳送',pending:'尚未受理'})[status]||'待確認';
