type Grant = { church_id?: string };
type AccountRow = {
  user_id: string;
  canonical_user_id?: string;
  linked_user_ids?: string[];
  display_name?: string;
  job_title?: string;
  is_active?: boolean;
  grants?: Grant[];
};
type RoleRow = { user_id: string; role_key: string; source_key?: string };
type StaffRow = { app_user_id: string; display_name: string };

const isMplusAccount = (row: AccountRow) => row.is_active === true && row.grants?.some(grant => grant.church_id === 'M+') === true;
const canonicalId = (row: AccountRow) => row.canonical_user_id || row.user_id;
const accountIds = (row: AccountRow) => new Set([canonicalId(row), row.user_id, ...(row.linked_user_ids || [])]);

export function financeAccounts(rows: AccountRow[], assigned: RoleRow[]) {
  const byCanonical = new Map<string, { userId: string; name: string; title: string; roles: string[]; inheritedRoles?: string[]; legacyEntry?: boolean }>();
  for (const row of rows) {
    if (!isMplusAccount(row)) continue;
    const userId = canonicalId(row);
    const ids = accountIds(row);
    const roles = assigned.filter(item => ids.has(item.user_id)).map(item => item.role_key);
    const inherited=assigned.filter(item=>ids.has(item.user_id)&&item.source_key==='accounting_assignment').map(item=>item.role_key);
    const legacyEntry=assigned.some(item=>ids.has(item.user_id)&&item.role_key==='entry'&&item.source_key==='individual');
    const previous = byCanonical.get(userId);
    const name = row.display_name || '管理同工';
    const title = row.job_title || '';
    byCanonical.set(userId, {
      userId,
      name: row.user_id === userId || !previous ? name : previous.name,
      title: row.user_id === userId || !previous ? title : previous.title,
      roles: [...new Set([...(previous?.roles || []), ...roles])],
      ...(inherited.length||previous?.inheritedRoles?.length?{inheritedRoles:[...new Set([...(previous?.inheritedRoles||[]),...inherited])],legacyEntry:legacyEntry||previous?.legacyEntry===true}:{})
    });
  }
  return [...byCanonical.values()];
}

export function financeCanonicalTarget(rows: AccountRow[], requestedId: string) {
  const account = rows.find(row => isMplusAccount(row) && accountIds(row).has(requestedId));
  return account ? canonicalId(account) : null;
}

export function financeWorkers(roleRows: Pick<RoleRow, 'user_id'>[], staffRows: StaffRow[]) {
  const names = new Map(staffRows.map(row => [row.app_user_id, row.display_name]));
  return [...new Set(roleRows.map(row => row.user_id))].map(userId => ({
    userId, name: names.get(userId) || `同工 ${userId.slice(0, 8)}`
  }));
}
