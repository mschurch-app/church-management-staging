// Reconcile a deterministic event before inserting. Never replace an unrelated event.
export async function ensureLeaveEvent({fetch,root,token,event,leaveId,storedId}){
 const id=storedId||event.id;if(!/^[a-v0-9]{5,1024}$/.test(id))throw Error('calendar_event_conflict');
 const headers={authorization:'Bearer '+token},opts={headers,redirect:'error',signal:AbortSignal.timeout(12000)};
 // Google may add timeZone to date fields: compare only semantically relevant values.
 const valid=data=>data?.status!=='cancelled'&&data?.extendedProperties?.private?.mplusLeaveId===leaveId&&['start','end'].every(k=>event[k].date?data[k]?.date===event[k].date:Date.parse(data[k]?.dateTime)===Date.parse(event[k].dateTime))&&JSON.stringify(data.recurrence||[])===JSON.stringify(event.recurrence||[]);
 let r=await fetch(root+'/'+id,opts);
 if(r.ok){if(!valid(await r.json()))throw Error('calendar_event_conflict');return;}
 if(r.status!==404)throw Error('calendar_read_failed');
 // A known stored event that disappeared needs human review, not silent recreation.
 if(storedId)throw Error('calendar_event_missing');
 r=await fetch(root+'?sendUpdates=none',{...opts,signal:AbortSignal.timeout(12000),method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(event)});
 if(r.status===409){const read=await fetch(root+'/'+id,{...opts,signal:AbortSignal.timeout(12000)});if(!read.ok||!valid(await read.json()))throw Error('calendar_event_conflict');return;}
 if(!r.ok)throw Error('calendar_write_failed');
 const saved=await r.json();if(saved.id!==id||!valid(saved))throw Error('calendar_event_conflict');
}
