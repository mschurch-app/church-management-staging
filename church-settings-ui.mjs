import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261009-app-audit2';
import {db} from './admin-db.mjs?v=20261009-app-audit2';import {loadChurchSettings,saveChurchSettings} from './church-settings-management.mjs';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:'M+',$=s=>document.querySelector(s);let current=null,busy=false;
const fields={brand_color:'#brand-color',logo_url:'#logo-url',service_info:'#service-info',address:'#address',map_url:'#map-url'};
function enabled(value){$('#form').querySelectorAll('input,textarea,button').forEach(n=>n.disabled=!value);}
async function load(){enabled(false);$('#status').textContent='正在載入教會設定…';try{current=await loadChurchSettings(db,church);for(const [key,selector] of Object.entries(fields))$(selector).value=current[key]||'';$('#color-picker').value=current.brand_color||'#F97316';enabled(true);$('#status').textContent='設定已載入。';}catch(error){current=null;$('#status').textContent=error.message;}}
$('#form').onsubmit=async e=>{e.preventDefault();if(busy||!current)return;busy=true;enabled(false);try{await saveChurchSettings(db,church,Object.fromEntries(Object.entries(fields).map(([key,selector])=>[key,$(selector).value])),current);await load();$('#status').textContent='教會設定已儲存。';}catch(error){enabled(true);$('#status').textContent=error.message;}finally{busy=false;}};
$('#color-picker').oninput=()=>$('#brand-color').value=$('#color-picker').value.toUpperCase();$('#brand-color').oninput=()=>{if(/^#[0-9A-Fa-f]{6}$/.test($('#brand-color').value))$('#color-picker').value=$('#brand-color').value;};$('#reload').onclick=load;const scoped=file=>file+'?church='+encodeURIComponent(church||'');$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 教會設定';$('#dashboard').href=scoped('admin-dashboard.html');$('#members').href=scoped('members.html');$('#customization-options').href=scoped('customization-settings.html');$('#admin-accounts').href=scoped('admin-accounts.html');$('#space-settings').href=scoped('spaces.html');$('#line-today').href=scoped('todays-message-settings.html');$('#line-help').href=scoped('line-preview.html')+'&feature=help';$('#line-prayer').href=scoped('prayers.html');$('#line-newcomer').href=scoped('customization-settings.html')+'&tab=form';$('#line-weekly').href=scoped('church-settings.html')+'#church-public-info';$('#line-love').href=scoped('love-share-settings.html');$('#line-pastoral').href=scoped('pastoral-content.html');$('#line-preview').href=scoped('line-preview.html')+'&feature=menu';$('#media-publishing').href=scoped('media-publishing-settings.html');$('#subtitle-library').hidden=church!=='M+';startHub();

async function startHub(){
  enabled(false);
  const cards=document.querySelectorAll('.settings-link-card,.line-settings-card');cards.forEach(n=>n.hidden=true);
  try{
    const access=await readAccess(db),capabilities=await db.rpc('get_my_app_capabilities');
    const show=(id,allowed)=>{const node=document.getElementById(id);if(node)node.hidden=!allowed;};
    const pastoral=canOpen(access,church,'pastoral'),weekly=canOpen(access,church,'website_weekly'),notifications=canOpen(access,church,'notification_settings');
    show('customization-options',pastoral);show('admin-accounts',capabilities.data?.is_owner===true);
    show('review-workflows',notifications);$('#review-workflows').href=scoped('review-workflow-settings.html');
    document.querySelector('.line-settings-card').hidden=!pastoral;
    show('website-maintenance',weekly);show('media-publishing',weekly&&canAction(access,church,'website_weekly','approve'));
    show('subtitle-library',church==='M+'&&weekly&&canAction(access,church,'website_weekly','edit'));
    show('space-settings',canOpen(access,church,'spaces'));show('members',canOpen(access,church,'members'));
    $('#church-public-info').hidden=!pastoral;
    if(pastoral)await load();else $('#status').textContent='依你的權限顯示可使用的設定工具。';
  }catch(error){$('#status').textContent=error.message;}
}
