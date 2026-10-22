export const APPLICATION_PAGE='coworker-apply.html';
const reviewErrors={role_grants_mismatch:'角色範本與勾選的功能不同，請改為「自訂權限」後重試；已填資料保留。',invalid_grant:'功能權限或所屬堂會不正確，請重新確認勾選內容。',invalid_role:'角色範本已變動，請改選「自訂權限」並確認功能後重試。',invalid_feature:'有功能操作已不適用，請重新確認該功能的權限。',invalid_feature_action:'請逐項確認功能的查看、新增、修改、刪除、匯出、審核與管理設定。',feature_without_grant:'有操作尚未勾選對應功能，請確認功能權限後重試。',invalid_preferences:'首頁建議功能已變動，請改選「自訂權限」並確認功能後重試。',invalid_profile:'核准使用姓名與職稱皆為必填，最多 60 個字。',application_not_found:'這筆申請已不在待審名單，請重新讀取申請確認。',account_changed:'同工資料已被更新，請重新讀取申請確認後再審核。'};
export const applicationErrors={line_required:'請先使用 LINE 驗證身分。',invalid_profile:'請填寫真實姓名、所屬教會及預計服事的事工；手機可留空。',application_changed:'申請已被更新，請重新查詢狀態後再操作。',already_authorized:'這個 LINE 已有同工權限，請回登入頁進入工作台。',existing_account:'這個身分已有同工資料，請使用「連結既有同工」核對，避免重複建立。',account_unavailable:'此帳號曾經核准，請聯絡管理員確認目前的使用權限。',not_owner:'只有帳號管理員可以審核申請。',invalid_decision:'請指定審核方式並確認授予的權限。'};
export async function applicationRPC(db,name,args={}){
 const request=db.rpc(name,args);
 const result=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(15000)):Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('連線逾時，請保留資料並重試。')),15000))]));
 if(result.error)throw Error((name==='review_coworker_application'&&reviewErrors[result.error.message])||applicationErrors[result.error.message]||'操作尚未確認完成，請保留資料並重試。');
 return result.data;
}
