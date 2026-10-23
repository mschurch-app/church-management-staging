import {db,church,authorizePublishing,publishingApi,invalidResult} from './publishing-settings-api.mjs?v=20261023-closeout1';
import {settingsWorkflow} from './settings-workflow.mjs?v=20261023-settings1';
const $=s=>document.querySelector(s),form=$('#form');
const fields={sermon_analysis_enabled:'#sermon-analysis',youtube_captions_enabled:'#youtube-captions',instagram_sermon_enabled:'#instagram-sermon',instagram_weekly_reel_enabled:'#instagram-weekly',instagram_weekday_reel_enabled:'#instagram-weekday',instagram_holiday_reel_enabled:'#instagram-holiday'};
const flow=settingsWorkflow({db,root:document.querySelector('main'),clear:()=>{form.hidden=true;form.reset();},sync:({busy,ready})=>{form.querySelectorAll('input').forEach(n=>n.disabled=busy||!ready);}});
function validate(data){if(!data.settings||Object.keys(fields).some(key=>typeof data.settings[key]!=='boolean'))throw invalidResult();return data;}
function apply(data){for(const [key,selector] of Object.entries(fields))$(selector).checked=data.settings[key];for(const kind of ['instagram','youtube']){const value=data.connections?.[kind],connected=value?.status==='connected';$('#'+kind+'-connection').textContent=connected?(kind==='instagram'?'@'+value.username:value.channel_title):value?'連線已失效，請重新連結':'尚未完成平台連線';const badge=$('#'+kind+'-badge');badge.textContent=connected?'已連線':'未連線';badge.classList.toggle('connected',connected);}form.hidden=false;flow.track(form);}
async function load(){await flow.load(async()=>{await authorizePublishing();return validate(await publishingApi('media-publishing-settings','get'));},apply);}
$('#back').href='church-settings.html?church='+encodeURIComponent(church);
document.querySelectorAll('.connection-row a').forEach(link=>link.href=link.getAttribute('href').split('?')[0]+'?church='+encodeURIComponent(church));
$('#reload').onclick=load;
form.onsubmit=event=>{event.preventDefault();flow.write(form,async()=>{const settings=Object.fromEntries(Object.entries(fields).map(([key,selector])=>[key,$(selector).checked]));return validate(await publishingApi('media-publishing-settings','save',{settings}));},'各項發布開關已儲存。',apply);};
flow.state();load();
