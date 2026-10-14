import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyDraft,validateDraft,generationReady,guideOptions,applyGenerated,characterCount} from '../sermon-preparation-contract.mjs';
const draft=()=>emptyDraft({title:'驗收專案',speaker:'驗收講員',scripture:'測試經文範圍',service_date:'2026-10-14'});
test('required information, known fields, and supported steps are enforced',()=>{
 assert.equal(validateDraft(draft()).step,'information');
 for(const patch of [{format:'unknown'},{step:'published'},{extra:true},{information:{title:''}},{target_characters:1000}])assert.throws(()=>validateDraft({...draft(),...patch}));
});
test('unreviewed material cannot enter any model generation',()=>{
 const d=draft();d.materials=[{kind:'personal',id:'a',title:'自有素材',speaker:'本人',content:'示例',note:'',reviewed:false}];
 assert.throws(()=>generationReady(d,'outline'),/materials_need_review/);d.materials[0].reviewed=true;generationReady(d,'outline');
 d.materials.push({...d.materials[0]});assert.throws(()=>validateDraft(d),/invalid_materials/);
});
test('archive source identity and content hash are required without claiming global review',()=>{
 const d=draft();d.materials=[{kind:'archive',id:'a',title:'來源',speaker:'候選',content:'內容',note:'',reviewed:true,url:'https://example.test/source',ordinal:1,content_sha:'a'.repeat(64)}];validateDraft(d);
 d.materials[0].url='javascript:alert(1)';assert.throws(()=>validateDraft(d),/invalid_materials/);
});
test('manuscript requires a confirmed outline and slides require measured body length',()=>{
 const d=draft();assert.throws(()=>generationReady(d,'manuscript'),/outline_required/);
 d.outline=['主段落一','主段落二','主段落三'];d.outline_confirmed=true;generationReady(d,'manuscript');
 d.manuscript='## 標題\n'+ '文'.repeat(4999);assert.throws(()=>generationReady(d,'slides'),/manuscript_too_short/);
 d.manuscript+='文';generationReady(d,'slides');
});
test('body count excludes headings, whitespace, source markers, and reference appendix',()=>{
 assert.equal(characterCount('## 開場\n正文 [素材 1]\n## 來源\n'+'參考'.repeat(5000)),2);
 assert.equal(characterCount('甲\n乙\t丙'),3);
});
test('adopting one AI result preserves notes and material choices; outline requires confirmation again',()=>{
 const d=draft();d.notes='我的修改';d.outline=['一','二','三'];d.outline_confirmed=true;
 const next=applyGenerated(d,'outline',{outline:['新一','新二','新三'],source_checklist:['核對出處']});
 assert.equal(next.notes,'我的修改');assert.equal(next.outline_confirmed,false);assert.deepEqual(d.outline,['一','二','三']);assert.equal(next.step,'outline');
});
test('replacing a manuscript clears stale slides and a deck is capped at 20 pages',()=>{
 const d=draft();d.slides=[{title:'舊頁',content:'舊內容',notes:''}];const next=applyGenerated(d,'manuscript',{manuscript:'新稿'});assert.equal(next.slides.length,0);
 assert.throws(()=>applyGenerated(d,'slides',{slides:Array.from({length:21},()=>({title:'頁',content:'',notes:''}))}),/invalid_slides/);
});
test('catalog exposes M+ editors only and includes shared metadata and group registration',async()=>{
 globalThis.window={};
 const {FUNCTION_CATALOG,FUNCTION_GROUPS}=await import('../app-function-definitions.mjs');
 const {availableFunctionKeys}=await import('../app-function-catalog.mjs');
 const editor={grants:['pastoral_chats','website_weekly'].map(permission=>({church_id:'M+',permission})),featurePermissions:[]};
 assert.equal(FUNCTION_CATALOG.sermon_preparation.permission,'website_weekly');assert(FUNCTION_GROUPS.some(g=>g.keys.includes('sermon_preparation')));
 assert(availableFunctionKeys(editor,'M+').includes('sermon_preparation'));assert(!availableFunctionKeys(editor,'SHiNE').includes('sermon_preparation'));
 assert(!availableFunctionKeys({...editor,featurePermissions:[{church_id:'M+',feature_key:'website_weekly',edit:false}]},'M+').includes('sermon_preparation'));
});
test('source rendering uses text nodes and historical source jobs cannot silently restore removed materials',()=>{
 const source=readFileSync(new URL('../sermon-preparation.mjs',import.meta.url),'utf8');
 assert(!source.includes('innerHTML'));assert(source.includes('!pendingResults.has(j.id)'));assert(source.includes('job.base_version!==project.version'));
});


test('video jobs only accept canonical public YouTube URLs',async()=>{
 const {videoUrl}=await import('../sermon-preparation-contract.mjs');
 assert.equal(videoUrl('https://youtu.be/abcdefghijk?list=discard'),'https://www.youtube.com/watch?v=abcdefghijk');
 for(const input of ['http://192.168.0.112/test','https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com/playlist?list=abc','javascript:alert(1)'])assert.throws(()=>videoUrl(input));
});
test('guided discovery requires three answered rounds before recommendations',()=>{
 let options=guideOptions();assert.deepEqual(options,{round:1,history:[]});
 for(let round=1;round<=3;round++){
  const previous={round,history:options.history,question:`第 ${round} 題`,choices:['盼望','禱告','關係','信心']};
  options=guideOptions(previous,[0,2]);
  assert.equal(options.round,round+1);assert.equal(options.history.length,round);
  assert.deepEqual(options.history.at(-1).selected,['盼望','關係']);
 }
 assert.equal(options.round,4);
 assert.throws(()=>guideOptions({round:4,history:options.history,question:'多問一題',choices:['甲','乙','丙','丁']},[0]),/invalid_guide/);
 assert.throws(()=>guideOptions({round:1,history:[],question:'題目',choices:['甲','乙','丙','丁']},[]),/invalid_guide/);
 assert.throws(()=>guideOptions({round:1,history:[],question:'題目',choices:['甲','乙','丙','丁']},[0,0]),/invalid_guide/);
});
