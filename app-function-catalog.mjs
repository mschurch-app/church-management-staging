import {canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';
import {FUNCTION_CATALOG,FUNCTION_GROUPS,SETTINGS_GROUPS,canonicalFunctionKey} from './app-function-definitions.mjs?v=20261010-festival1';
export * from './app-function-definitions.mjs?v=20261010-festival1';
export function availableFunctionKeys(access,church,home={},settings={}) {
 const configured=new Map((settings.feature_modules||[]).map(item=>[canonicalFunctionKey(item.key),item]));
 const assigned=new Set((home.home_modules||[]).map(canonicalFunctionKey));
 return Object.keys(FUNCTION_CATALOG).filter(key=>{
  const item=FUNCTION_CATALOG[key];
  if(item.church&&item.church!==church)return false;
  if(configured.get(key)?.enabled===false)return false;
  if(item.permission&&!canOpen(access,church,item.permission))return false;
  if(item.action&&!canAction(access,church,item.permission,item.action))return false;
  if(item.owner&&!home.is_owner)return false;
  if(key==='system_monitor'&&!home.system_monitor_access)return false;
  if(key==='church_settings'&&!home.is_owner&&!SETTINGS_GROUPS.some(group=>group.keys.some(entry=>{const tool=FUNCTION_CATALOG[entry];return !tool.owner&&(!tool.church||tool.church===church)&&configured.get(entry)?.enabled!==false&&canOpen(access,church,tool.permission)&&(!tool.action||canAction(access,church,tool.permission,tool.action));})))return false;
  if((key.startsWith('school')||key.startsWith('basketball')||key==='pastoral_workspace')&&!assigned.has(key))return false;
  return true;
 });
}
export function favoriteKeys(saved,defaults,available){const keys=Array.isArray(saved)?saved:defaults;return [...new Set(keys.map(canonicalFunctionKey))].filter(key=>available.includes(key));}

export function availableSettingsGroups(access,church,home={},settings={}){const allowed=new Set(availableFunctionKeys(access,church,home,settings));return SETTINGS_GROUPS.map(group=>({...group,keys:group.keys.filter(key=>allowed.has(key))})).filter(group=>group.keys.length||group.key==='church'&&canOpen(access,church,'pastoral'));}
