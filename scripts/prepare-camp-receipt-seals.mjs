// Run locally before Edge deployment. PNG originals and the generated bundle stay private.
import {readFile,writeFile} from 'node:fs/promises';
const seals={};
for(const role of ['chairperson','accountant','handler','organization']){
 const bytes=await readFile(new URL(`../private-receipt-assets/web/${role}.png`,import.meta.url));
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('invalid PNG: '+role);
 seals[role]='data:image/png;base64,'+bytes.toString('base64');
}
await writeFile(new URL('../supabase/functions/heat-camp-receipt/seals.mjs',import.meta.url),'export const seals='+JSON.stringify(seals)+';\n');
console.log('Private server seal bundle prepared; do not publish this file as a web asset.');
