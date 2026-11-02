import {db} from './admin-db.mjs?v=20261102-bibletree-admin1';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {createFunctionEntry,setStatus} from './app-ui.mjs?v=20261102-bibletree-admin1';
const $=id=>document.getElementById(id);
let actor=null,generation=0;
function clear(){actor=null;$('workspace').hidden=true;$('tools').replaceChildren();}
async function load(){
 const sequence=++generation;clear();$('reload').disabled=true;$('login').hidden=true;setStatus($('status'),'正在確認帳號與管理權限…',{busy:true});
 try{
  if((new URLSearchParams(location.search).get('church')||'M+')!=='M+')throw Error('此管理頁僅提供 M+ 使用。');
  const access=await readAccess(db,{fresh:true});
  const {data:{session}}=await db.auth.getSession();
  if(sequence!==generation)return;
  if(!session?.user?.id||session.user.id!==access.user?.id)throw Error('登入狀態已變更，請重新登入。');
  if(!canOpen(access,'M+','tree_reading_admin'))throw Error('此帳號沒有讀經樹管理檢視權限。');
  actor=access.user.id;$('tools').replaceChildren(...['bibletree_players','bibletree_devotional'].map(key=>createFunctionEntry(key,{church:'M+'})));
  $('workspace').hidden=false;setStatus($('status'),'管理入口已載入。靈修發布另依目前帳號的核准權限判定。');
 }catch(e){if(sequence===generation){clear();setStatus($('status'),e.message,{tone:'error'});$('login').hidden=false;}}
 finally{if(sequence===generation)$('reload').disabled=false;}
}
$('login').href='admin-login.html?next='+encodeURIComponent('bibletree-admin.html?church=M%2B');
$('reload').onclick=()=>void load();
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||actor&&session?.user?.id!==actor){generation++;clear();$('reload').disabled=false;setStatus($('status'),'登入身分已變更，請重新確認權限。',{tone:'error'});$('login').hidden=false;}});
void load();
