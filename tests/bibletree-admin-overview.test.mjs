import test from 'node:test';import assert from 'node:assert/strict';
import {overviewProjection} from '../bibletree-admin-overview.mjs';
const base={ok:true,version:1,generated_at:'2026-11-02T12:00:00Z',stats:{accounts:29,journeys:22,signins_7d:12,beta:20,feedback:4}};
test('overview retains only its anonymous versioned contract, never extra player payloads',()=>{
 const view=overviewProjection({...base,user_id:'private',players:['private'],stats:{...base.stats,token:'private'}});assert.deepEqual(view,{version:1,generated_at:base.generated_at,stats:base.stats});assert(!JSON.stringify(view).includes('private'));
 assert.notEqual(view.stats,base.stats);
});
test('unknown timestamps, missing metrics, non-integers and impossible population subsets are unavailable rather than healthy',()=>{
 for(const v of [null,{...base,ok:false},{...base,version:2},{...base,generated_at:'invalid'},{...base,stats:{...base.stats,journeys:30}},{...base,stats:{...base.stats,feedback:-1}},{...base,stats:{...base.stats,beta:NaN}},{...base,stats:{accounts:29}}])assert.throws(()=>overviewProjection(v));
});
