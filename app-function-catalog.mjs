import {canOpen,canAction} from './admin-access.mjs?v=20261103-unifiedpermissions1';
import {FUNCTION_CATALOG,FUNCTION_GROUPS,SETTINGS_GROUPS,canonicalFunctionKey} from './app-function-definitions.mjs?v=20261104-school-scheduling1';
export * from './app-function-definitions.mjs?v=20261104-school-scheduling1';
export function availableFunctionKeys(access,church,home={},settings={}) {
 const assigned=new Set((home.module_permissions||[]).map(canonicalFunctionKey));
 return Object.keys(FUNCTION_CATALOG).filter(key=>{
  const item=FUNCTION_CATALOG[key];
  if(item.church&&item.church!==church)return false;
  if(item.scheduleAccess&&home.schoolScheduleAccess!==true)return false;
  if(item.payrollAccess&&!home.payrollAccess)return false;
  if(item.accountingReportAccess&&!home.accountingReportAccess&&!home.is_owner)return false;
  if(item.receiptAccess&&!home.financeReceiptAccess)return false;
  if(item.financeAccess&&!home.financeCashAccess)return false;
  if(item.expenseAccess&&!home.financeExpenseAccess&&!home.is_owner)return false;
  if(item.permission&&!canOpen(access,church,item.permission))return false;
  if(item.action&&!canAction(access,church,item.permission,item.action))return false;
  if(item.owner&&!home.is_owner)return false;
  if(key==='system_monitor'&&!home.system_monitor_access)return false;
  if(key==='church_settings'&&!home.is_owner&&!SETTINGS_GROUPS.some(group=>group.keys.some(entry=>{const tool=FUNCTION_CATALOG[entry];return !tool.owner&&(!tool.church||tool.church===church)&&canOpen(access,church,tool.permission)&&(!tool.action||canAction(access,church,tool.permission,tool.action));})))return false;
  if(!['school_payroll','school_staff_scheduling'].includes(key)&&key.startsWith('school')&&!assigned.has('school'))return false;
  if(key==='school_reports'&&home.schoolRole!=='同工')return false;
  if(key.startsWith('basketball')&&!assigned.has('basketball'))return false;
  if(key==='pastoral_workspace'&&!assigned.has('pastoral_workspace'))return false;
  if(key==='church_albums'&&!assigned.has('pastoral_workspace'))return false;
  if(key==='pastoral_workflow_survey'&&!assigned.has('pastoral_workspace'))return false;
  return true;
 });
}
export function favoriteKeys(saved,defaults,available){const keys=Array.isArray(saved)?saved:defaults;return [...new Set(keys.map(canonicalFunctionKey))].filter(key=>available.includes(key));}

export function availableSettingsGroups(access,church,home={},settings={}){const allowed=new Set(availableFunctionKeys(access,church,home,settings));return SETTINGS_GROUPS.map(group=>({...group,keys:group.keys.filter(key=>allowed.has(key))})).filter(group=>group.keys.length||group.key==='church'&&canOpen(access,church,'pastoral'));}


