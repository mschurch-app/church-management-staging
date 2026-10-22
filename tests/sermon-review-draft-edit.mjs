import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const review=readFileSync(new URL('../supabase/functions/sermon-social-review/index.ts',import.meta.url),'utf8');
const start=review.indexOf(" if(body.action==='save'&&!canEditIg)"),end=review.indexOf(" if(body.action==='confirm_youtube_edit')",start);
assert(start>=0&&end>start);
const code='async function saveDraft(){'+review.slice(start,end)+'}';
async function trySave(allowed,result){
 const current={id:'draft',status:'pending_review',review_stage:'initial_review',updated_at:'2026-10-22T01:00:00Z',social_media_type:'reel',social_image_url:'cover'};
 const filters=[];let patch;
 const q={update(value){patch=value;return q;},eq(key,value){filters.push([key,value]);return q;},select(){return q;},maybeSingle:async()=>({data:result,error:null})};
 const context={body:{action:'save',caption:'revised'},canEditIg:allowed,canReviewIg:false,origin:'app',draft:current,Date,String,Error,json:(_origin,status,value)=>({httpStatus:status,...value}),cleaned:()=>({caption:'revised',updated_at:'2026-10-22T02:00:00Z'}),db:{from:()=>q}};
 return {response:await vm.runInNewContext(code+'\nsaveDraft',context)(),filters,patch};
}
let save=await trySave(false,{id:'draft'});
assert.equal(save.response.httpStatus,409);
assert.equal(save.patch,undefined);
save=await trySave(true,{id:'draft',caption:'revised'});
assert.equal(save.response.httpStatus,200);
assert.equal(save.response.draft.caption,'revised');
assert.equal(save.patch.caption,'revised');
assert.deepEqual(save.filters,[['id','draft'],['status','pending_review'],['review_stage','initial_review'],['updated_at','2026-10-22T01:00:00Z']]);
save=await trySave(true,null);
assert.equal(save.response.httpStatus,409);
console.log('sermon IG draft edit: unauthorized, saved, and concurrent-update cases passed');
