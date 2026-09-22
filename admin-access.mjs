export const TAB_PERMISSIONS = Object.freeze({
  members: ['members'], services: ['schedules'],
  groups: ['groups', 'members'], prayers: ['private_prayers'], spaces: ['spaces'], pastoral: ['pastoral_chats']
});
const churches = new Set(['M+', 'SHiNE']);
const permissions = new Set(['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces']);

const cleanLabel = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
export function profileFromUser(user) {
  const app = user?.app_metadata || {}, personal = user?.user_metadata || {};
  const emailName = String(user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return {
    name: cleanLabel(app.display_name || app.full_name || app.name || personal.display_name || personal.full_name || personal.name || emailName) || '管理同工',
    title: cleanLabel(app.job_title || app.title || personal.job_title || personal.title) || '管理同工'
  };
}

export async function readAccess(db) {
  const verified = await db.auth.getUser();
  if (verified.error || !verified.data?.user) throw new Error('請重新登入。');
  const result = await db.rpc('get_my_church_access');
  if (result.error || !Array.isArray(result.data)) throw new Error('無法確認管理權限，請稍後再試。');
  const grants = result.data.filter(row => churches.has(row.church_id) && permissions.has(row.permission));
  if (!grants.length) throw new Error('帳號尚未獲授權，或已停用。');
  return {
    user: { id: verified.data.user.id, ...profileFromUser(verified.data.user) },
    grants,
    churches: [...new Set(grants.map(row => row.church_id))]
  };
}
export function canOpen(access, church, tab) {
  const required = TAB_PERMISSIONS[tab];
  return Boolean(required && required.every(permission =>
    access.grants.some(row => row.church_id === church && row.permission === permission)));
}
export function chooseChurch(access, preference) {
  return access.churches.includes(preference) ? preference : access.churches[0];
}
