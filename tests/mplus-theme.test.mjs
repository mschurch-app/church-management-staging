import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../mplus-theme.js',import.meta.url),'utf8');
function boot(query,path='/members.html'){
 const sheets=['theme-vitality.css','apple-ui.css','church-palette.css','auth.css','app-consistency.css'].map(f=>({href:'https://example.test/'+f,media:''}));
 const classes=new Set(),root={dataset:{},classList:{add:x=>classes.add(x)}};let redirect;
 const document={currentScript:{src:'https://example.test/mplus-theme.js'},documentElement:root,querySelectorAll:()=>sheets,querySelector:s=>s.includes('data-mplus-theme')?{}:null};
 vm.runInNewContext(source,{URL,URLSearchParams,document,window:{},location:{search:query,pathname:path,replace:u=>redirect=String(u)}});
 return {sheets,root,classes,redirect};
}
test('M+ disables only conflicting skins and retains functional base styles',()=>{const r=boot('?church=M%2B');assert.equal(r.root.dataset.church,'M+');assert.deepEqual(r.sheets.filter(s=>s.media==='not all').map(s=>new URL(s.href).pathname),['/theme-vitality.css','/apple-ui.css','/church-palette.css']);assert(r.classes.has('mplus-theme'));});
test('explicit SHiNE remains unchanged even when next mentions M+',()=>{const r=boot('?church=SHiNE&next=mplus-dashboard.html');assert.equal(r.classes.size,0);assert(r.sheets.every(s=>!s.media));assert.equal(r.redirect,undefined);});
test('shared unselected login is not assigned a church',()=>assert.equal(boot('').classes.size,0));
test('old M+ workspace redirects only M+ while coworker tools remain available',()=>{assert.match(boot('?church=M%2B','/pastoral/workspace.html').redirect,/mplus-dashboard/);assert.equal(boot('?church=SHiNE','/pastoral/workspace.html').redirect,undefined);assert.match(boot('?church=M%2B','/pastoral/coworker-tools.html').redirect,/mplus-coworker-tools.html/);assert.equal(boot('?church=M%2B','/pastoral/mplus-coworker-tools.html').redirect,undefined);});
test('homepage no longer links to old workspace and still reads the same calendar and task data',()=>{const s=readFileSync(new URL('../mplus-week-calendar.mjs',import.meta.url),'utf8');assert(!s.includes('pastoral/workspace.html'));assert(!s.includes('管理工作'));assert(s.includes('readCalendar(start)'));assert(s.includes('PASTORAL_TASKS_ENDPOINT'));assert(s.includes('showCalendarEvent(task)'));assert(s.includes('共用行事曆'));});
