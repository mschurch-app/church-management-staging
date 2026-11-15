/** Phase 1 pure policies. These functions do NOT authenticate requests or send mail.
 * A future server adapter must resolve the canonical staff principal itself.
 * Never treat a principal, provider identity or LINE binding from a browser as trusted.
 */
export const FEATURE = Object.freeze({
  key:'personal_mail_assistant', title:'智慧郵件助理',
  description:'自己的多個信箱，一份個人摘要', file:'personal-mail-assistant.html',
  group:'pastoral', symbol:'sparkle', church:'M+', configurableHome:false,
  searchTerms:Object.freeze(['郵件','Email','Gmail','iCloud','個人摘要']),
  release:'preview', enabled:false
});
export const DEFAULTS = Object.freeze({
  timezone:'Asia/Taipei', time:'07:00', deliveryEnabled:false,
  recipient:'self', excludeAds:true, readonly:true,
  categories:Object.freeze(['important','church','association','personal','system'])
});
const PROVIDERS = new Set(['gmail','icloud']);
const STATES = new Set(['connected','reconnect','paused','failed']);
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const LINE_USER = /^U[0-9a-f]{32}$/i;
function reject(code){throw new Error(code);}
function id(value){if(typeof value!=='string'||!ID.test(value))reject('invalid_identifier');return value;}
function text(value,max=254){if(typeof value!=='string'||!value.trim()||value.length>max||/[\r\n\u0000-\u001f]/.test(value))reject('invalid_text');return value.trim();}
export function assertOwner(principal,ownerId){
  if(!principal||principal.isActive!==true)reject('login_required');
  if(id(principal.id)!==id(ownerId))reject('owner_mismatch');
  return ownerId;
}
/** Allowlist DTO fields. Do not propagate secrets, raw bodies, or arbitrary properties. */
export function accountView(principal,record){
  assertOwner(principal,record?.ownerId);
  if(!PROVIDERS.has(record.provider))reject('unsupported_provider');
  if(!STATES.has(record.status))reject('invalid_account_status');
  const email=text(record.email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject('invalid_email');
  return Object.freeze({id:id(record.id),ownerId:principal.id,provider:record.provider,
    providerIdentity:text(record.providerIdentity,512),email,status:record.status});
}
/** Use a verified provider identity, NOT email spelling, to identify an account. */
function accountViews(principal,records){
  const safe=records.map(record=>accountView(principal,record));
  const ids=new Set(), identities=new Set();
  for(const row of safe){const identity=JSON.stringify([row.provider,row.providerIdentity]);
    if(ids.has(row.id)||identities.has(identity))reject('duplicate_account');
    ids.add(row.id);identities.add(identity);
  }
  return safe;
}
export function upsertAccount(principal,records,incoming){
  const safe=accountViews(principal,records);
  const added=accountView(principal,incoming);
  const sameIdentity=r=>r.provider===added.provider&&r.providerIdentity===added.providerIdentity;
  if(safe.some(r=>r.id===added.id&&!sameIdentity(r)))reject('account_id_conflict');
  const index=safe.findIndex(sameIdentity);
  if(index>=0){safe[index]={...added,id:safe[index].id};return safe;}
  return [...safe,added];
}
export function coverage(principal,records,results){
  const accounts=accountViews(principal,records);
  const ids=new Set(accounts.map(a=>a.id));
  const seen=new Set();
  for(const result of results){
    assertOwner(principal,result.ownerId);
    if(!ids.has(result.accountId)||seen.has(result.accountId))reject('invalid_sync_result');
    if(!['complete','partial','failed'].includes(result.status))reject('invalid_sync_status');
    seen.add(result.accountId);
  }
  const active=accounts.filter(a=>a.status!=='paused');
  const complete=active.filter(a=>a.status==='connected'&&results.some(r=>r.accountId===a.id&&r.status==='complete')).length;
  return Object.freeze({total:accounts.length,paused:accounts.length-active.length,
    expected:active.length,complete,incomplete:active.length-complete,
    allComplete:active.length>0&&complete===active.length});
}
export function notificationPreferences(input={}){
  const time=input.time===undefined?DEFAULTS.time:input.time;
  if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))reject('invalid_time');
  if(input.timezone!==undefined&&input.timezone!==DEFAULTS.timezone)reject('unsupported_timezone');
  if(input.recipient!==undefined&&input.recipient!=='self')reject('personal_only');
  if(input.deliveryEnabled!==undefined&&typeof input.deliveryEnabled!=='boolean')reject('invalid_delivery_setting');
  return Object.freeze({...DEFAULTS,time,deliveryEnabled:input.deliveryEnabled===true});
}
/** Server-owned binding only: do NOT accept a recipient ID supplied by the client. */
export function personalRecipient(principal,binding){
  assertOwner(principal,binding?.ownerId);
  if(binding.active!==true||binding.verified!==true||binding.sameProvider!==true)reject('line_not_verified');
  if(typeof binding.lineUserId!=='string'||!LINE_USER.test(binding.lineUserId))reject('personal_only');
  return binding.lineUserId;
}
export function canEnableDelivery({principal,accounts,binding,consent,backendReady}){
  if(backendReady!==true||consent!==true)return false;
  try{return accounts.map(a=>accountView(principal,a)).some(a=>a.status==='connected')&&Boolean(personalRecipient(principal,binding));}
  catch{return false;}
}
/** DB uniqueness key. The transport must persist a separate UUID retry key. */
export function deliveryIdentity(principal,date){
  assertOwner(principal,principal?.id);
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))reject('invalid_date');
  const parsed=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==date)reject('invalid_date');
  return `personal-mail:v1:${principal.id}:${date}:Asia/Taipei:line`;
}
