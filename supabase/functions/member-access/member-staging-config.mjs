export function stagingReady({url,key,projectRef,enabled}){
  if(enabled!=='true'||!key||typeof projectRef!=='string'||! /^[a-z]{20}$/.test(projectRef)||projectRef==='vpysepgvweabioklppda')return false;
  return url===`https://${projectRef}.supabase.co`;
}
