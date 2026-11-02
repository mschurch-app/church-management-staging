import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {availableFunctionKeys} from '../app-function-catalog.mjs';
import {FUNCTION_CATALOG,functionHref,HOME_MODULES} from '../app-function-definitions.mjs?v=20261102-bibletree-admin1';
import {visibleCenters} from '../mplus-navigation.mjs';
const keys=['bibletree_admin','bibletree_players','bibletree_devotional'];
const access={grants:['members','tree_reading_admin'].map(permission=>({church_id:'M+',permission})),featurePermissions:[]};
test('existing tree view grants reach all three registered tools without granting new capabilities or preferences',()=>{
 const available=availableFunctionKeys(access,'M+');for(const key of keys){assert(available.includes(key));assert.equal(FUNCTION_CATALOG[key].permission,'tree_reading_admin');assert(!HOME_MODULES[key]);const href=new URL(functionHref(key,'M+'),'https://os.invalid/');assert.equal(href.searchParams.get('church'),'M+');assert(fs.existsSync(new URL('..'+href.pathname,import.meta.url)));}
 const center=visibleCenters(new Set(available));assert(center.admin.cards.flatMap(([,items])=>items).some(([,key])=>key==='bibletree_admin'));
});
test('missing grants, explicit view denial, other church and disabled directory never expose the management shortcut',()=>{
 const denied=[{...access,grants:[]},{...access,featurePermissions:[{church_id:'M+',feature_key:'tree_reading_admin',view:false}]}];
 for(const actor of denied)for(const key of keys)assert(!availableFunctionKeys(actor,'M+').includes(key));
 for(const key of keys)assert(!availableFunctionKeys(access,'SHiNE').includes(key));
 const available=availableFunctionKeys(access,'M+',{}, {feature_modules:[{key:'bibletree_admin',enabled:false}]});assert(!available.includes('bibletree_admin'));assert(!JSON.stringify(visibleCenters(new Set(available))).includes('bibletree_admin'));
});
