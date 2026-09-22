// Test LIFF IDs must be separately created; never use production welcome IDs.
export const TEST_LIFF_IDS=Object.freeze({'M+':'2011645391-Mwy3h7jm',SHiNE:'2011645391-df7KVuPS'});
export function welcomeLiffConfig(search){
 const values=new URLSearchParams(search).getAll('church');
 if(values.length!==1||!Object.hasOwn(TEST_LIFF_IDS,values[0]))throw new Error('invalid_church');
 const church=values[0],liffId=TEST_LIFF_IDS[church];
 if(!liffId)throw new Error('test_liff_unconfigured');
 return {church,liffId,channel:'2011645391'};
}
