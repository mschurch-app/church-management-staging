export const APPLICATION_PAGE='coworker-apply.html';
export const applicationErrors={line_required:'請先使用 LINE 驗證身分。',invalid_profile:'請填寫真實姓名、所屬教會及預計服事的事工；手機可留空。',application_changed:'申請已被更新，請重新查詢狀態後再操作。',already_authorized:'這個 LINE 已有同工權限，請回登入頁進入工作台。',existing_account:'這個身分已有同工資料，請使用「連結既有同工」核對，避免重複建立。',account_unavailable:'此帳號曾經核准，請聯絡管理員確認目前的使用權限。',not_owner:'只有帳號管理員可以審核申請。',invalid_decision:'請指定審核方式並確認授予的權限。'};
export async function applicationRPC(db,name,args={}){
 const request=db.rpc(name,args);
 const result=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(15000)):Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('連線逾時，請保留資料並重試。')),15000))]));
 if(result.error)throw Error(applicationErrors[result.error.message]||'操作尚未確認完成，請保留資料並重試。');
 return result.data;
}
