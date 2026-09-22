import {readAccess} from './admin-access.mjs?v=20260923-profile1';
export const PERMISSIONS=Object.freeze({members:'會員名冊',attendance:'聚會點名',groups:'小組／小家',schedules:'服事排班',private_prayers:'代禱關懷',pastoral_chats:'牧養與內容',spaces:'場地預約'});
export const ROLE_TEMPLATES=Object.freeze({
  pastor:{label:'牧者',permissions:Object.keys(PERMISSIONS)},
  pastor_spouse:{label:'師母',permissions:Object.keys(PERMISSIONS)},
  administrator:{label:'行政管理',permissions:['members','attendance','groups','schedules','spaces']},
  group_leader:{label:'小組／小家長',permissions:['members','attendance','groups']},
  care:{label:'關懷同工',permissions:['members','private_prayers','pastoral_chats']},
  facilities:{label:'場地同工',permissions:['spaces']},
  custom:{label:'自訂權限',permissions:[]}
});
async function signedIn(db){await readAccess(db);}
export function permissionsForRole(role){return [...(ROLE_TEMPLATES[role]?.permissions||[])];}
export async function listAdminAccounts(db){await signedIn(db);const {data,error}=await db.rpc('list_admin_accounts_v2');if(error||!Array.isArray(data))throw new Error(String(error?.message||'').includes('not_owner')?'只有專案擁有者可以管理帳號。':'無法載入管理員帳號。');return data;}
export async function addExistingAdmin(db,email){await signedIn(db);const clean=String(email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)||clean.length>254)throw new Error('請輸入正確的 Email。');const {data,error}=await db.rpc('add_existing_admin_account',{p_email:clean});if(error||!data)throw new Error(String(error?.message||'').includes('auth_user_not_found')?'此 Email 尚未建立 Supabase Auth 登入帳號。':'無法加入管理員帳號。');return data;}
export async function saveAdminProfile(db,row,name,title){await signedIn(db);const cleanName=String(name||'').trim(),cleanTitle=String(title||'').trim();if(!cleanName||cleanName.length>60||!cleanTitle||cleanTitle.length>60)throw new Error('姓名與職稱皆為必填，最多 60 個字。');const {data,error}=await db.rpc('set_admin_account_profile',{p_user:row.user_id,p_display_name:cleanName,p_job_title:cleanTitle});if(error||data!==true)throw new Error('管理員基本資料未儲存。');return true;}
export async function saveAdminAccess(db,row,active,grants,roles){await signedIn(db);if(row?.is_owner)throw new Error('專案擁有者權限不可在此修改。');const cleaned=grants.filter(g=>['M+','SHiNE'].includes(g.church_id)&&Object.hasOwn(PERMISSIONS,g.permission));const cleanRoles=roles.filter(r=>['M+','SHiNE'].includes(r.church_id)&&Object.hasOwn(ROLE_TEMPLATES,r.role_key));if(cleaned.length!==grants.length||cleaned.length>20||cleanRoles.length!==roles.length||cleanRoles.length>2)throw new Error('功能權限或角色範本不正確。');const {data,error}=await db.rpc('set_admin_account_access_v2',{p_user:row.user_id,p_active:Boolean(active),p_grants:cleaned,p_roles:cleanRoles});if(error||data!==true)throw new Error('帳號權限未儲存。');return true;}
