export const LINE_LOGIN_CHANNEL_ID='2011645391';

// One member LIFF per church serves the menu, daily verse, help cards,
// newcomer entry, weekly gatherings and love-share builder.
export const MEMBER_LIFF_IDS=Object.freeze({
  'M+':'2011645391-Mwy3h7jm',
  SHiNE:'2011645391-df7KVuPS',
});

// Prayer uses a separate full-height LIFF because it keeps a live connection.
export const PRAYER_LIFF_IDS=Object.freeze({
  'M+':'2011645391-tldJTxN0',
  SHiNE:'2011645391-0tHoZ8pb',
});

export const LINE_MEMBER_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/line-member';
export const PRAYER_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/prayer-wall';

function liffState(value){
  let decoded=String(value||'');
  for(let i=0;i<2;i++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}
  const question=decoded.indexOf('?'),path=(question>=0?decoded.slice(0,question):decoded).replace(/^\/+|\/+$/g,''),params=new URLSearchParams(question>=0?decoded.slice(question+1):decoded.replace(/^[?#]/,''));
  return {params,path};
}

export function lineConfig(search){
  const query=new URLSearchParams(search),state=liffState(query.get('liff.state'));
  const clientId=query.get('liffClientId')||state.params.get('liffClientId')||'',inferred=Object.entries(MEMBER_LIFF_IDS).find(([,id])=>id===clientId)?.[0];
  const church=state.params.get('church')||query.get('church')||inferred;
  const feature=state.params.get('feature')||query.get('feature')||state.path||'menu';
  if(!Object.hasOwn(MEMBER_LIFF_IDS,church))throw new Error('invalid_church');
  return {church,feature,liffId:MEMBER_LIFF_IDS[church],prayerLiffId:PRAYER_LIFF_IDS[church]};
}
