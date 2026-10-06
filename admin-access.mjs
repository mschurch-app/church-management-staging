export const TAB_PERMISSIONS = Object.freeze({
  members: ['members'], attendance: ['attendance'], schedules: ['schedules'], services: ['schedules'],
  groups: ['groups', 'members'], prayers: ['private_prayers'], spaces: ['spaces'], pastoral: ['pastoral_chats'],
  newcomer_care: ['members','newcomer_care'], tree_reading_admin: ['members','tree_reading_admin'],
  binding_review: ['members','binding_review'], notification_settings: ['members','notification_settings'],
  website_weekly: ['pastoral_chats','website_weekly'], website_group_resources: ['pastoral_chats','website_group_resources'], inventory: ['inventory']
});
const churches = new Set(['M+', 'SHiNE']);
const permissions = new Set(['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']);

const cleanLabel = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
export function profileFromUser(user) {
  const app = user?.app_metadata || {}, personal = user?.user_metadata || {};
  const emailName = String(user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return {
    name: cleanLabel(app.display_name || app.full_name || app.name || personal.display_name || personal.full_name || personal.name || emailName) || '管理同工',
    title: cleanLabel(app.job_title || app.title || personal.job_title || personal.title) || '管理同工'
  };
}

function serverProfile(value, fallback) {
  const row = Array.isArray(value) ? value[0] : null;
  return {
    name: cleanLabel(row?.display_name) || fallback.name,
    title: cleanLabel(row?.job_title) || fallback.title
  };
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let accessCache=null,accessCachedAt=0,accessRequest=null;

async function fetchAccess(db, { user: signedInUser = null, retry = true } = {}) {
  let user = signedInUser;
  if (!user) {
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data?.user) throw new Error('登入狀態尚未建立，請重新登入。');
    user = verified.data.user;
  }

  let result, profileResult;
  const attempts = retry ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    [result, profileResult] = await Promise.all([
      db.rpc('get_my_church_access'), db.rpc('get_my_admin_profile')
    ]);
    if (!result.error && Array.isArray(result.data)) break;
    if (attempt + 1 < attempts) {
      await db.auth.refreshSession();
      await wait(250);
    }
  }
  if (result?.error || !Array.isArray(result?.data)) throw new Error('密碼已驗證，但暫時無法讀取管理權限，請再登入一次。');
  const grants = result.data.filter(row => churches.has(row.church_id) && permissions.has(row.permission));
  if (!grants.length) throw new Error('帳號尚未獲授權，或已停用。');
  const grantedChurches = [...new Set(grants.map(row => row.church_id))];
  const featureResults = await Promise.all(grantedChurches.map(async church_id => {
    const response = await db.rpc('get_my_feature_permissions', { p_church: church_id });
    if (response.error || !Array.isArray(response.data)) throw new Error('無法確認頁面權限，為保護資料請重新整理或重新登入。');
    return response.data.map(item => ({ church_id, ...item }));
  }));
  const fallback = profileFromUser(user);
  return {
    user: { id: user.id, ...serverProfile(profileResult?.error ? null : profileResult?.data, fallback) },
    grants,
    churches: grantedChurches,
    featurePermissions: featureResults.flat()
  };
}
export async function readAccess(db, options = {}) {
  const fresh=options.fresh===true;
  if(!fresh&&accessCache&&Date.now()-accessCachedAt<30000)return accessCache;
  if(!fresh&&accessRequest)return accessRequest;
  const request=fetchAccess(db,options);
  accessRequest=request;
  try{
    const value=await request;
    accessCache=value;accessCachedAt=Date.now();
    return value;
  }finally{
    if(accessRequest===request)accessRequest=null;
  }
}
export function canOpen(access, church, tab) {
  const required = TAB_PERMISSIONS[tab];
  return Boolean(required && required.every(permission =>
    access.grants.some(row => row.church_id === church && row.permission === permission)
    && access.featurePermissions?.find(row => row.church_id === church && row.feature_key === permission)?.view !== false));
}
export function canAction(access,church,feature,action){const granted=access.grants.some(row=>row.church_id===church&&row.permission===feature);if(!granted)return false;const row=access.featurePermissions?.find(item=>item.church_id===church&&item.feature_key===feature);return row?row[action]!==false:true;}
export function chooseChurch(access, preference) {
  return access.churches.includes(preference) ? preference : access.churches[0];
}
