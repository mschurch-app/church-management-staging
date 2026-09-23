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

export function lineConfig(search){
  const query=new URLSearchParams(search),state=new URLSearchParams(query.get('liff.state')||'');
  const church=state.get('church')||query.get('church');
  const feature=state.get('feature')||query.get('feature')||'menu';
  if(!Object.hasOwn(MEMBER_LIFF_IDS,church))throw new Error('invalid_church');
  return {church,feature,liffId:MEMBER_LIFF_IDS[church],prayerLiffId:PRAYER_LIFF_IDS[church]};
}
