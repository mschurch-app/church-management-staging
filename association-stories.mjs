import {mountMplusFunctionNavigation} from './mplus-function-nav.mjs?v=20261102-bibletree-admin1';
import {db,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './admin-db.mjs?v=20261102-bibletree-admin1';
import {mountAssociationStories} from './association-stories-ui.mjs?v=20261116-canva1';
const root=document.querySelector('#story-app');let app=null,identity=null,generation=0;
async function api(body){const ticket=generation,{data,error}=await db.auth.getSession();if(error||!data.session)throw Object.assign(Error('login_required'),{code:'login_required'});let r;try{r=await fetch(SUPABASE_URL+'/functions/v1/association-stories',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+data.session.access_token,apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});}catch{throw Object.assign(Error('unavailable'),{code:'unavailable'});}if(ticket!==generation)throw Error('login_required');const result=await r.json().catch(()=>({}));if(!r.ok||result.ok!==true)throw Object.assign(Error(result.error||'unavailable'),{code:result.error||'unavailable'});return result;}
async function init(){const {data,error}=await db.auth.getUser();if(error||!data.user){root.textContent='請先登入同工帳號，再開啟照片說故事。';return;}identity=data.user.id;app=mountAssociationStories({root,api});await app.start();}
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&identity&&session.user.id!==identity){generation++;app?.dispose();root.textContent='登入帳號已變更，請重新開啟此頁確認權限。';}});void init();

mountMplusFunctionNavigation({church:'M+',center:'website'});
