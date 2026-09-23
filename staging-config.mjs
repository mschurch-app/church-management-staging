import {MEMBER_LIFF_IDS} from './line-config.mjs';
export const TEST_LIFF_IDS=MEMBER_LIFF_IDS;
export function welcomeLiffConfig(search){
 const values=new URLSearchParams(search).getAll('church');
 if(values.length!==1||!Object.hasOwn(TEST_LIFF_IDS,values[0]))throw new Error('invalid_church');
 const church=values[0],liffId=TEST_LIFF_IDS[church];
 if(!liffId)throw new Error('test_liff_unconfigured');
 return {church,liffId,channel:'2011645391'};
}
