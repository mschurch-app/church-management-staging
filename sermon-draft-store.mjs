// Optional device drafts only. This store never sends data or grants access.
const DATABASE='church-os-sermon-drafts-v1',TABLE='drafts';
export const DRAFT_LIFETIME=24*60*60*1000;
export const draftConflict=()=>Object.assign(new Error('另一個分頁已更新裝置草稿，這一頁的輸入仍保留。'),{name:'DraftConflictError'});
const keyFor=scope=>JSON.stringify([scope.userId,scope.sessionId,scope.church]);
export function createSermonDraftStore({indexedDB=globalThis.indexedDB,now=()=>Date.now()}={}){
 let connection;
 function open(){
  if(!indexedDB)return Promise.reject(new Error('此瀏覽器無法保留裝置草稿。'));
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
   const request=indexedDB.open(DATABASE,1);let settled=false;const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);connection=null;reject(error);};const timer=setTimeout(()=>fail(new Error('裝置草稿讀取逾時。')),5000);
   request.onupgradeneeded=()=>request.result.createObjectStore(TABLE,{keyPath:'key'});
   request.onerror=()=>fail(request.error);
   request.onblocked=()=>fail(new Error('裝置草稿忙碌，請稍後再試。'));
   request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;clearTimeout(timer);db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  });
  return connection;
 }
 async function transaction(run){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE);let value,failure;
   const timer=setTimeout(()=>{failure=new Error('裝置草稿處理逾時。');tx.abort();},5000);
   tx.oncomplete=()=>{clearTimeout(timer);resolve(value);};
   tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(failure||tx.error||new Error('裝置草稿未能保留。'));};
   const finish=result=>{value=result;},abort=error=>{failure=error;tx.abort();};
   try{run(store,finish,abort);}catch(error){abort(error);}
  });
 }
 const live=row=>row&&row.version===1&&Number.isFinite(row.updatedAt)&&Number.isFinite(row.expiresAt)&&row.expiresAt<=row.updatedAt+DRAFT_LIFETIME&&row.expiresAt>now()&&row.updatedAt<=now()+60000;
 return{
  async read(scope){return transaction((store,finish)=>{const r=store.get(keyFor(scope));r.onsuccess=()=>{if(!live(r.result)){if(r.result)store.delete(r.result.key);finish(null);}else finish(r.result);};});},
  async write(scope,expectedRevision,payload){
   return transaction((store,finish,abort)=>{
    const key=keyFor(scope),r=store.get(key);
    r.onsuccess=()=>{
     const old=live(r.result)?r.result:null;
     if((old?.revision||null)!==expectedRevision){abort(draftConflict());return;}
     const row={...payload,...scope,key,version:1,updatedAt:now(),expiresAt:now()+DRAFT_LIFETIME,revision:crypto.randomUUID()};
     store.put(row);finish(row);
    };
   });
  },
  async remove(scope,expectedRevision){return transaction((store,finish,abort)=>{const key=keyFor(scope),r=store.get(key);r.onsuccess=()=>{const old=live(r.result)?r.result:null;if(old&&(old.revision!==expectedRevision)){abort(draftConflict());return;}store.delete(key);finish(true);};});},
  async prune(scope){return transaction((store,finish)=>{const r=store.openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor){finish(true);return;}const row=cursor.value;if(!live(row))cursor.delete();cursor.continue();};});},
  async clearSession(scope){return transaction((store,finish)=>{const r=store.openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor){finish(true);return;}if(cursor.value.userId===scope.userId&&cursor.value.sessionId===scope.sessionId)cursor.delete();cursor.continue();};});}
 };
}
