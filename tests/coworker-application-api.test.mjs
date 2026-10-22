import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationRPC} from '../coworker-application-api.mjs';
const failed=message=>({rpc:()=>({abortSignal:async()=>({error:{message}})})});
test('role mismatch tells the reviewer how to recover without discarding input',async()=>{
 await assert.rejects(()=>applicationRPC(failed('role_grants_mismatch'),'review_coworker_application'),/自訂權限.*已填資料保留/);
});
test('review-specific profile errors describe approval fields',async()=>{
 await assert.rejects(()=>applicationRPC(failed('invalid_profile'),'review_coworker_application'),/姓名與職稱/);
 await assert.rejects(()=>applicationRPC(failed('invalid_profile'),'submit_coworker_application'),/所屬教會及預計服事/);
});
test('stale, revoked and missing applications remain actionable',async()=>{
 for(const [code,match] of [['application_changed',/已被更新/],['not_owner',/只有帳號管理員/],['application_not_found',/重新讀取申請/],['invalid_grant',/所屬堂會/]])await assert.rejects(()=>applicationRPC(failed(code),'review_coworker_application'),match);
});
test('unrecognized server detail is not exposed in a generic failure',async()=>{
 await assert.rejects(()=>applicationRPC(failed('synthetic private database detail'),'review_coworker_application'),e=>e.message==='操作尚未確認完成，請保留資料並重試。');
});
test('successful replies preserve the exact server acknowledgement',async()=>{
 const data={status:'approved'};
 assert.equal(await applicationRPC({rpc:()=>({abortSignal:async()=>({data})})},'review_coworker_application'),data);
});
