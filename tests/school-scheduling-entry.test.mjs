import test from 'node:test';
import assert from 'node:assert/strict';
import {availableFunctionKeys,FUNCTION_CATALOG} from '../app-function-catalog.mjs';
import {visibleCenters} from '../mplus-navigation.mjs';
const access={grants:[],featurePermissions:[]};
const keys=home=>availableFunctionKeys(access,'M+',home);
test('only a verified scheduler profile reveals the scheduling action',()=>{
 for(const home of [{},{is_owner:true},{payrollAccess:true},{module_permissions:['school'],schoolRole:'同工'},{schoolScheduleAccess:'true'}])assert(!keys(home).includes('school_staff_scheduling'));
 assert(keys({schoolScheduleAccess:true}).includes('school_staff_scheduling'));
 assert(!availableFunctionKeys(access,'SHiNE',{schoolScheduleAccess:true}).includes('school_staff_scheduling'));
});
test('administration payroll category contains scheduling before monthly review',()=>{
 const allowed=keys({schoolScheduleAccess:true,payrollAccess:true});
 const category=visibleCenters(new Set(allowed)).admin.cards.find(([title])=>title==='課輔薪資');
 assert.deepEqual(category[1].map(([label])=>label),['班表安排','每月結算與審核']);
 const target=new URL(FUNCTION_CATALOG[category[1][0][1]].file);
 assert.equal(target.origin,'https://school.mchurch.online');
 assert.equal(target.searchParams.get('tab'),'schedules');
});
test('payroll reviewers keep monthly review without gaining scheduling',()=>{
 const category=visibleCenters(new Set(keys({payrollAccess:true,is_owner:true}))).admin.cards.find(([title])=>title==='課輔薪資');
 assert.deepEqual(category[1],[['每月結算與審核','school_payroll']]);
});

