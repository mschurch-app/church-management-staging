export const TAB_PERMISSIONS = Object.freeze({
  members: ['members'], services: ['schedules'],
  groups: ['groups', 'members'], prayers: ['private_prayers']
});
const churches = new Set(['M+', 'SHiNE']);
const permissions = new Set(['members','attendance','groups','schedules','private_prayers','pastoral_chats']);

export async function readAccess(db) {
  const verified = await db.auth.getUser();
  if (verified.error || !verified.data?.user) throw new Error('請重新登入。');
  const result = await db.rpc('get_my_church_access');
  if (result.error || !Array.isArray(result.data)) throw new Error('無法確認管理權限，請稍後再試。');
  const grants = result.data.filter(row => churches.has(row.church_id) && permissions.has(row.permission));
  if (!grants.length) throw new Error('帳號尚未獲授權，或已停用。');
  return {
    user: { id: verified.data.user.id, name: verified.data.user.email || '同工' },
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
