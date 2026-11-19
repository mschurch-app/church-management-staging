// Bounded operational codes only. No form values, account IDs, tokens, names or photos are stored here.
const key='member-form-trace-v1',build='20261119-flowtrace1';let memory=[],flowId;
const uuid=()=>globalThis.crypto?.randomUUID?.();
function events(){try{if(globalThis.sessionStorage){const saved=JSON.parse(globalThis.sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))memory=saved;}}catch{}return memory.filter(e=>Number.isSafeInteger(e?.at)&&e.at<=Date.now()+60000&&Date.now()-e.at<600000).slice(-8);}
export function recordFormEvent(stage,code,requestId,church){try{if(!['M+','SHiNE'].includes(church))return;flowId||=uuid();const id=uuid();if(!flowId||!id)return;memory=[...events(),{id,flowId,church,stage,code,build,at:Date.now(),...(requestId?{requestId}:{})}].slice(-8);try{globalThis.sessionStorage?.setItem(key,JSON.stringify(memory));}catch{}}catch{}}
// Repeated carriers retain event IDs so log analysis can deduplicate. No extra HTTP requests are made.
export function formEventsForRequest(church){const rows=events().filter(e=>!church||e.church===church);return rows.length?{formEvents:rows}:{ };}
