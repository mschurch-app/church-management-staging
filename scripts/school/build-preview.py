"""Generate no-network/no-write synthetic UI fixture from the exact OS entry."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
s=(root/'school/index.html').read_text();i=s.index('const SUPABASE_URL');a=s.rfind('<script',0,i);b=s.index('</script>',i)+9
stub='''<script>
// Synthetic view only: no school API, camera, persistence or external writes.
const demoRole=new URLSearchParams(location.search).get('role')==='teacher'?'老師':'同工';
let demoPeople=[{id:'2026PDEMO',name:'示範工讀生',role_type:'工讀生',status:'在職',version:'1',editable:true},{id:'2026TDEMO',name:'示範老師',role_type:'老師',status:'在職',version:'1',editable:true}];
let demoRoute=new URLSearchParams(location.search).get('tab')||'schedules';
window.openSchoolStaffPeople=()=>window.SchoolStaffPeople.open();
window.schoolInterface={staffPeople:{allowed:()=>demoRole==='同工',refresh:async()=>{},request:async(path,options)=>{if(!options)return structuredClone(demoPeople);const p=JSON.parse(options.body);if(p.action==='create'){const person={...p.input,id:'2026PDEMO'+demoPeople.length,version:'1',editable:true};demoPeople.push(person);return {ok:true,person};}const person=demoPeople.find(r=>r.id===p.id);if(p.action==='delete')person.status='離職';else Object.assign(person,p.input);person.version=String(Number(person.version)+1);return {ok:true,person};}},state:()=>({user:{name:'示範同工',role_type:demoRole},busy:Boolean(window.SchoolStaffPeople?.busy)}),navigate:tab=>{demoRoute=tab;for(const panel of document.querySelectorAll('main > [id^="tab-"]'))panel.classList.toggle('hidden',panel.id!=='tab-'+tab);window.SchoolUI?.onNavigate(tab);},roster:scope=>{document.getElementById('user-role-scope').value=scope;window.schoolInterface.navigate('students');}};
window.addEventListener('DOMContentLoaded',()=>{
const $=id=>document.getElementById(id);
$('auth-logged').classList.remove('hidden');$('auth-logged').classList.add('flex');$('logged-user-tag').textContent='示範同工';$('clock-display').textContent='版面預覽 · 合成資料';
const values={'stat-stu-count':'24','stat-staff-count':'4','stat-pts-count':'24','stat-sch-count':'32','total-count-badge':'32 班','total-shift-badge':'96 小時','total-workers-badge':'4 人','total-wage-badge':'$19,200','rc-stat-total':'26 人','rc-stat-attend':'24 人','rc-stat-hw':'92%','rc-stat-signed':'23 人','cs-stat-count':'18 次','cs-stat-mins':'540 分鐘','cs-stat-students':'6 位','cs-stat-followup':'3 案','calendar-month-title':'2026 年 10 月'};
for(const [key,value] of Object.entries(values))$(key).textContent=value;
$('rollcall-date-picker').value='2026-10-21';$('print-month-filter').value='2026-10';$('schedule-worker-filter').innerHTML='<option>全部同工</option><option>示範老師</option>';
$('calendar-grid').innerHTML=Array.from({length:35},(_,i)=>'<div class="p-2 min-h-[80px]"><strong>'+((i%31)+1)+'</strong>'+(i%7===2?'<p class="mt-2 p-1 rounded bg-emerald-50 text-emerald-900">16:00 課業陪伴</p>':'')+'</div>').join('');
$('students-cards-mobile').innerHTML='<article class="p-4 border rounded-2xl"><strong>示範學童 A</strong><p>國小五年級 · 在班</p><p>學號 2026SDEMO · 夢想點數 12 點</p></article><article class="p-4 border rounded-2xl"><strong>示範學童 B</strong><p>國中一年級 · 在班</p><p>學號 2026SDEMO2 · 夢想點數 8 點</p></article>';
$('students-table').innerHTML='<tr><td>—</td><td>DEMO</td><td>示範學童 A</td><td>學生／在班</td><td>國小五年級</td><td>合成資料</td><td>—</td><td>12</td><td>預覽</td></tr>';
$('rollcall-cards-mobile').innerHTML='<article class="p-4 border rounded-2xl"><strong>示範學童 A</strong><p class="my-2">國小五年級</p><label>出席狀態<select class="w-full"><option>出席</option><option>請假</option></select></label><label>作業進度<select class="w-full"><option>已完成</option><option>未完成</option></select></label><label>聯絡簿<select class="w-full"><option>已核章</option></select></label></article>';
$('rollcall-table-body').innerHTML='<tr><td>DEMO</td><td>示範學童 A</td><td>國小五年級</td><td>出席</td><td>已完成</td><td>已核章</td><td>—</td></tr>';
$('counseling-list').innerHTML='<tr><td>10/21 16:00</td><td>示範學童 A</td><td>課業輔導</td><td>示範老師</td><td>30 分鐘</td><td>閱讀練習與課業陪伴。</td><td>下週持續追蹤。</td><td>預覽</td></tr>';
$('logs-cards-mobile').innerHTML='<article class="p-4 border rounded-2xl"><strong>示範學童 A</strong><p>15:30 · 學生到班</p></article><article class="p-4 border rounded-2xl"><strong>示範老師</strong><p>15:00 · 上班打卡</p></article>';
$('logs-list').innerHTML='<tr><td>15:30</td><td>—</td><td>DEMO</td><td>示範學童 A</td><td>學生</td><td>到班</td></tr>';
$('print-paper-content').innerHTML='<h2 class="text-xl font-bold mb-4">2026 年 10 月 · 學生出席點名總表</h2><p>版面預覽（合成資料）</p><table class="w-full mt-6"><thead><tr><th>姓名</th><th>應到日數</th><th>出席日數</th><th>出席率</th></tr></thead><tbody><tr><td>示範學童 A</td><td>20</td><td>19</td><td>95%</td></tr></tbody></table>';
window.SchoolUI.sync(window.schoolInterface.state().user);window.schoolInterface.navigate(demoRoute);
});
</script>'''
s=s[:a]+stub+s[b:]
s=re.sub(r'<script[^>]+src="(?!https://cdn.tailwindcss.com|school-icons.js|church-os-ui.js|school-staff-people.js|../dock-viewport.mjs)[^"]+"[^>]*></script>','',s)
s=s.replace('<head>','<head><base href="../school/">',1).replace('<title>課輔工作台｜M＋教會 OS</title>','<title>課輔工作台預覽（合成資料）</title>')
(root/'tests/school-os-preview.html').write_text(s)
