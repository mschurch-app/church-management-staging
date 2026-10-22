import assert from 'node:assert/strict';
import {focusGroups,sourceReviewDate} from '../mplus-work-focus.mjs';
const today='2030-10-22',base={assignedToMe:true,status:'pending'},rows=[
 {...base,id:'old-promo',title:'2030-10-18 主日預告審核',workflow:'weekly_promo_review'},
 {...base,id:'old-caption',title:'確認 2030-06-01 字幕',workflow:'sermon_youtube_caption_review'},
 {...base,id:'legacy',title:'舊測試工作',status:'approved',createdAt:'2030-09-20T00:00:00Z'},
 {...base,id:'new-undated',title:'新工作',createdAt:'2030-10-20T00:00:00Z'},
 {...base,id:'explicit-overdue',title:'需追蹤的期限工作',dueAt:'2030-10-01T00:00:00+08:00',createdAt:'2030-09-01T00:00:00Z'},
 {...base,id:'not-date',title:'2030-02-31 非法日期',workflow:'weekly_promo_review'},
 {...base,id:'ordinary',title:'2030-06-01 客戶原始資料日期',workflow:'mplus_assignment'},
 {...base,id:'other',assignedToMe:false,title:'2030-10-01 他人審核',workflow:'weekly_promo_review'},
 {...base,id:'done',title:'2030-10-01 已完成',status:'completed',workflow:'weekly_promo_review'},
 {...base,id:'shared',assignedToMe:false,sharedWithMe:true,title:'2030-10-01 協作審核',workflow:'weekly_bulletin_review'}
];
const result=focusGroups(rows,today);assert.deepEqual(result.older.map(t=>t.id),['old-promo','old-caption','legacy','shared']);
assert(!result.buckets.flatMap(b=>b.items).some(t=>result.older.includes(t)));
assert.deepEqual(result.buckets.find(b=>b.key==='overdue').items.map(t=>t.id),['explicit-overdue']);
assert(result.buckets.find(b=>b.key==='undated').items.some(t=>t.id==='new-undated'));
assert.equal(sourceReviewDate(rows.find(t=>t.id==='not-date')),'');assert.equal(sourceReviewDate(rows.find(t=>t.id==='ordinary')),'');
assert(!result.older.some(t=>['done','other'].includes(t.id)));assert.equal(rows.find(t=>t.id==='old-caption').status,'pending');
console.log('PASS source dates, invalid dates, old undated separation, real overdue, permission scope and unchanged status (8 checks)');
