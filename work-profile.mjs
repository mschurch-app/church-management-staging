import {createFunctionEntry} from './app-ui.mjs?v=20261019-workflow1';
if(typeof document!=='undefined'&&!document.querySelector('#work-profile-style')){const l=document.createElement('link');l.id='work-profile-style';l.rel='stylesheet';l.href=new URL('./work-profile.css?v=20261021-work-roles1',import.meta.url).href;document.head.append(l);}
export const WORK_ROLES=['主任牧師','牧師','師母','傳道','輔導','事工領袖','小組長'];
export const WORK_DOMAINS={church:'教會',school:'課輔',team:'籃球球隊',camp:'熱火籃球營'};
export const WORK_CATALOG={"church":{"administration":"行政","accounting":"財務會計","general_affairs":"總務","worship":"敬拜","welcome":"接待關懷","youth_junior":"學生牧區 · 青少","youth":"學生牧區 · 青年","college":"學生牧區 · 大專","children":"兒童主日學","av_sound":"影音 · 音控","av_lighting":"影音 · 燈控","av_subtitles":"影音 · 字幕"},"school":{"director":"主任","teacher":"老師","assistant":"工讀生","volunteer":"志工"},"team":{"manager":"經理"},"camp":{"manager":"營隊管理者","coworker":"營隊同工"}};
const node=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
const label=(name,input)=>{const l=node('label',name);l.append(input);return l;};
const read=async(db,user,church)=>{const query=db.rpc('get_work_profile',{p_user:user,p_church:church});const r=await (typeof query.abortSignal==='function'?query.abortSignal(AbortSignal.timeout(12000)):query);if(r.error)throw Error('身分與事工分工未能讀取，請重新載入。');return r.data;};
export function createWorkProfileEditor(db,user,getChurch){
 const section=node('fieldset','','work-profile-editor');section.append(node('legend','教會職位與事工分工'));
 const state=node('p','正在讀取身分與分工…','muted'),body=node('div');section.append(state,body);
 let generation=0,ready=false,profile=null,controls=null;
 async function load(){const current=++generation,church=getChurch();ready=false;body.replaceChildren();state.textContent='正在讀取身分與分工…';try{const data=await read(db,user,church);if(current!==generation)return;if(!data.can_edit)throw Error('只有帳號管理者可以指定職位與分工。');profile=data.profile;body.replaceChildren();const role=node('select');for(const r of WORK_ROLES)role.append(new Option(r,r));role.value=profile?.church_role||'事工領袖';body.append(label('教會職位',role),node('p','職位表示服事身分；工具與資料仍須具備既有功能權限。主責事工先顯示，共同參與不授予人員管理。','muted'));const domains=[];
 for(const [domain,title]of Object.entries(WORK_DOMAINS)){const details=document.createElement('details');details.open=!!profile?.assignments?.some(a=>a.domain===domain)||domain==='church';details.append(node('summary',title));const primary=node('select');primary.append(new Option('未設定主責',''));for(const [key,title]of Object.entries(WORK_CATALOG[domain]))primary.append(new Option(title,key));primary.value=profile?.assignments?.find(a=>a.domain===domain&&a.type==='primary')?.key||'';details.append(label('主責事工',primary));const shared=node('fieldset','','work-shared');shared.append(node('legend','共同參與（可複選）'));const boxes=[];for(const [key,title]of Object.entries(WORK_CATALOG[domain])){const b=node('input');b.type='checkbox';b.value=key;b.checked=!!profile?.assignments?.some(a=>a.domain===domain&&a.key===key&&a.type==='shared');const l=label(title,b);l.prepend(b);shared.append(l);boxes.push(b);}const sync=()=>{for(const b of boxes){b.disabled=b.value===primary.value;if(b.disabled)b.checked=false;}};primary.onchange=sync;sync();details.append(shared);body.append(details);domains.push({domain,primary,boxes});}
 const oversight=node('fieldset');oversight.append(node('legend','另行委任統籌'),node('p','只在明確委任的範圍顯示統籌視角，不因職位自動勾選。','muted'));const oversightBoxes=[];for(const [key,title]of Object.entries(WORK_DOMAINS)){const b=node('input');b.type='checkbox';b.value=key;b.checked=(profile?.oversight_domains||[]).includes(key);const l=label(title,b);l.prepend(b);oversight.append(l);oversightBoxes.push(b);}body.append(oversight);const route=node('select');route.append(new Option('青年教會群組圖卡','group'),new Option('個人提醒：LINE；未綁定則 Email＋App','personal'));route.value=profile?.reminder_route||'personal';body.append(label('當天 08:30 工作提醒方式',route));controls={role,domains,oversightBoxes,route};ready=true;state.textContent=profile?.source==='legacy_import_review'?'已帶入可確認的既有設定；請核對主責、共同參與及統籌委任。':'身分與事工分工已讀取。';
 }catch(e){if(current!==generation)return;state.textContent=e.message;const retry=node('button','重新載入身分分工','secondary');retry.type='button';retry.onclick=load;body.append(retry);}}
 function values(){if(!ready||!controls)throw Error('身分與事工分工尚未載入，請重新載入後再儲存。');const assignments=[];for(const c of controls.domains){if(c.primary.value)assignments.push({domain:c.domain,key:c.primary.value,type:'primary'});for(const b of c.boxes)if(b.checked)assignments.push({domain:c.domain,key:b.value,type:'shared'});}return {church_role:controls.role.value,assignments,oversight_domains:controls.oversightBoxes.filter(b=>b.checked).map(b=>b.value),reminder_route:controls.route.value,expected_version:profile?.version||0};}
 return {section,load,values,ready:()=>ready};
}
const PRIMARY_TOOLS={
 'church.accounting':['finance_cash'],
 'church.administration':['website_weekly','association_news','review_workflows','notification_settings'],
 'church.general_affairs':['spaces','inventory'],
 'church.worship':['schedules','service_signups','service_quick_match'],
 'church.welcome':['newcomer_care','schedules'],
 'church.youth_junior':['groups','attendance','website_group_resources','newcomer_care'],
 'church.youth':['groups','attendance','website_group_resources','newcomer_care'],
 'church.college':['groups','attendance','website_group_resources','newcomer_care'],
 'church.children':['schedules','attendance','website_group_resources'],
 'church.av_sound':['schedules','inventory'],'church.av_lighting':['schedules','inventory'],'church.av_subtitles':['schedules'],
 'school.director':['school_students','school_schedules','school_rollcall','school_counseling','school_reports'],
 'school.teacher':['school_students','school_schedules','school_rollcall','school_counseling','school_checkin'],
 'school.assistant':['school_schedules','school_rollcall','school_checkin'],'school.volunteer':['school_schedules','school_checkin'],
 'team.manager':['basketball','basketball_schedule','basketball_gamecenter'],'camp.manager':['heat_camp'],'camp.coworker':['pastoral_workspace']
};
const SHARED_TOOLS={church:['pastoral_workspace','schedules'],school:['school_schedules','school_checkin','pastoral_workspace'],team:['basketball_schedule','pastoral_workspace'],camp:['pastoral_workspace']};
export function workspaceToolGroups(profile,available){
 const allow=new Set(available),used=new Set();const pick=keys=>keys.filter(k=>allow.has(k)&&!used.has(k)&&(used.add(k),true));
 const primary=pick((profile.assignments||[]).filter(a=>a.type==='primary').flatMap(a=>PRIMARY_TOOLS[a.domain+'.'+a.key]||[]));
 const shared=pick((profile.assignments||[]).filter(a=>a.type==='shared').flatMap(a=>SHARED_TOOLS[a.domain]||[]));
 const own=pick(['pastoral_workspace',...(['主任牧師','牧師','傳道'].includes(profile.church_role)?['sermon_preparation']:[])]);
 const overviewMap={church:['groups','attendance','schedules'],school:['school_reports','school_schedules'],team:['basketball_gamecenter','basketball_schedule'],camp:['heat_camp']};const oversight=pick((profile.oversight_domains||[]).flatMap(d=>overviewMap[d]||[]));
 return [{label:'主責事工工具',keys:primary},{label:'共同參與與被指派工作',keys:shared},{label:'個人工具',keys:own},{label:'另行委任的統籌工具',keys:oversight}].filter(g=>g.keys.length);
}
export async function mountWorkProfile({db,allowed,openSchool}){
 let section=document.querySelector('#work-profile-home');if(!section){section=node('section','','work-profile-home');section.id='work-profile-home';const anchor=document.querySelector('#mplus-week-slot')||document.querySelector('.mplus-week')||document.querySelector('#summary');anchor?anchor.before(section):document.querySelector('main')?.append(section);}
 try{const data=await read(db,null,'M+'),profile=data.profile;section.replaceChildren();if(!profile){section.append(node('p','服事身分尚未設定，請由帳號管理者指定。','muted'));return;}section.append(node('small','我的身分與分工','work-profile-kicker'),node('h2',profile.church_role));const chips=node('div','','work-profile-chips');for(const type of ['primary','shared'])for(const a of profile.assignments||[])if(a.type===type)chips.append(node('span',(type==='primary'?'主責｜':'共同｜')+WORK_DOMAINS[a.domain]+' · '+(WORK_CATALOG[a.domain]?.[a.key]||a.key),type));if(!chips.children.length)chips.append(node('span','尚未指定事工分工'));for(const d of profile.oversight_domains||[])chips.append(node('span','另行委任統籌｜'+WORK_DOMAINS[d],'oversight'));section.append(chips);
 for(const group of workspaceToolGroups(profile,allowed)){section.append(node('h3',group.label));const grid=node('div','','work-profile-tools');for(const key of group.keys){const card=createFunctionEntry(key,{church:'M+',variant:'favorite'});if(key.startsWith('school')){const a=card.querySelector('a');a.onclick=e=>openSchool?.(e,a.href);}grid.append(card);}section.append(grid);}
 }catch(e){section.replaceChildren(node('p',e.message,'muted'));const retry=node('button','重新讀取身分與分工','secondary');retry.type='button';retry.onclick=()=>mountWorkProfile({db,allowed,openSchool});section.append(retry);}
}
