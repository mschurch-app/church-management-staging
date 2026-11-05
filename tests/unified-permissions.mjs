import assert from 'node:assert/strict';
import {availableFunctionKeys} from '../app-function-catalog.mjs';
const access={grants:[{church_id:'M+',permission:'members'}],featurePermissions:[{church_id:'M+',feature_key:'members',view:true}]};
let keys=availableFunctionKeys(access,'M+',{role_key:'pastor',home_modules:['school']},{feature_modules:[{key:'members',enabled:false,dashboard:false,navigation:false}]});assert(keys.includes('members'));assert(!keys.includes('school'));assert(!keys.includes('finance_cash'));assert(!keys.includes('finance_receipts'));assert(!keys.includes('admin_accounts'));
keys=availableFunctionKeys(access,'M+',{module_permissions:['school'],schoolRole:'老師',payrollAccess:true,accountingReportAccess:true});assert(keys.includes('school_students'));assert(!keys.includes('school_reports'));assert(keys.includes('school_payroll'));assert(keys.includes('finance_accounting_reports'));assert(!keys.includes('finance_cash'));assert(!keys.includes('finance_receipts'));
keys=availableFunctionKeys({...access,featurePermissions:[{church_id:'M+',feature_key:'members',view:false}]},'M+',{});assert(!keys.includes('members'));
keys=availableFunctionKeys(access,'M+',{module_permissions:['school','pastoral_workspace'],schoolRole:'同工',financeReceiptAccess:true,financeCashAccess:true});assert(keys.includes('school_reports'));assert(!keys.includes('church_albums'));assert(keys.includes('pastoral_workspace'));assert(keys.includes('finance_receipts'));assert(keys.includes('finance_cash'));
assert(!availableFunctionKeys(access,'SHiNE',{module_permissions:['school'],schoolRole:'同工'}).includes('school_payroll'));
console.log('PASS navigation: permissions determine entries; legacy enabled/dashboard/home presentation flags cannot override; private actions, school roles and church isolation preserved');

assert(availableFunctionKeys({grants:[{church_id:'M+',permission:'church_albums'}],featurePermissions:[]},'M+',{}).includes('church_albums'));
assert(!availableFunctionKeys({grants:[{church_id:'M+',permission:'church_albums'}],featurePermissions:[{church_id:'M+',feature_key:'church_albums',view:false}]},'M+',{}).includes('church_albums'));
