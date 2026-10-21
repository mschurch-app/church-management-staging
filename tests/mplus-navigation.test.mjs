import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {MPLUS_CENTERS,visibleCenters} from '../mplus-navigation.mjs';import {FUNCTION_CATALOG} from '../app-function-definitions.mjs';
test('five hubs in approved order and all linked functions exist',()=>{assert.deepEqual(Object.keys(MPLUS_CENTERS),['church','school','admin','service','website']);for(const center of Object.values(MPLUS_CENTERS))for(const [,links]of center.cards)for(const [,key,file]of links){assert.ok(FUNCTION_CATALOG[key],key);const href=file||FUNCTION_CATALOG[key].file;if(!href.startsWith('https:'))assert.ok(fs.existsSync(new URL('../'+href.split(/[?#]/)[0],import.meta.url)),href);}});
test('no unauthorized link becomes visible',()=>{for(const c of Object.values(visibleCenters(new Set(['groups']))))for(const [,links]of c.cards)for(const [,key]of links)assert.equal(key,'groups');});
test('finance is in the church tab only when the finance role is allowed',()=>{
 const church=MPLUS_CENTERS.church.cards.find(([title])=>title==='奉獻與財務');
 assert.deepEqual(church[1],[['主日奉獻','finance_cash']]);
 assert.equal(visibleCenters(new Set(['groups'])).church.cards.some(([title])=>title==='奉獻與財務'),false);
 assert.equal(visibleCenters(new Set(['finance_cash'])).church.cards.some(([title])=>title==='奉獻與財務'),true);
 assert.equal(visibleCenters(new Set(['finance_cash'])).admin.cards.some(([title])=>title==='奉獻與財務'),false);
});
test('basketball standalone app is excluded; camp retained',()=>{const keys=MPLUS_CENTERS.admin.cards.flatMap(([,links])=>links.map(([,key])=>key));assert.ok(keys.includes('heat_camp'));assert.ok(!keys.some(key=>key.startsWith('basketball')));});
test('M+ has dedicated page and controller; SHiNE never mounts M+ navigation',()=>{const original=fs.readFileSync(new URL('../admin-dashboard-ui.mjs',import.meta.url),'utf8');assert.ok(original.includes("if(church==='M+')"));assert.ok(!original.includes('mountMplusNavigation'));const m=fs.readFileSync(new URL('../mplus-dashboard-ui.mjs',import.meta.url),'utf8');assert.ok(m.includes("const preferred='M+'"));assert.ok(m.includes("if(church==='M+')"));});
