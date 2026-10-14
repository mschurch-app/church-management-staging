// October-only: authenticated team data, server-authoritative supplements and opt-in portraits.
const LABEL={bless:'送來祝福',pray:'已為你禱告',support:'送來活水補給',care:'送來關懷',request:'提出支援請求'};
const NEED={hp:'需要 HP',mp:'需要 MP',both:'需要 HP／MP',prayer:'請為我禱告'};
const $=s=>document.querySelector(s);
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
export function setupTeamSocial({getTeam,send,openDialog,closeDialog,announce,renderAvatar}){
 if(document.body.dataset.octoberTest!=='true')return {render(){}};
 let team=null,chosen=null,chosenInvite=null,busy=false,requestRecipient=null,firstRender=true,lastFeed='';
 const orbit=node('section',null,'team-orbit');orbit.id='team-orbit';orbit.setAttribute('aria-label','小樹旁的隊友');$('#garden').append(orbit);
 const banner=node('p',null,'team-spark');banner.id='team-spark';banner.setAttribute('role','status');banner.hidden=true;orbit.after(banner);
 const settings=node('section',null,'team-sharing');settings.innerHTML='<label><input id="team-avatar-share" type="checkbox">讓隊友看見我的 LINE 頭像</label><button id="team-avatar-save" type="button" class="quiet-button">保存頭像設定</button><p class="muted">只分享給目前隊友；可隨時取消。未分享時顯示花園角色。</p>';
 $('#team-privacy').after(settings);

 const board=node('section',null,'team-request-board');board.innerHTML='<div class="team-section-heading"><h3>一起守望</h3><button id="team-help-open" type="button" class="secondary">向隊友求援</button></div><p id="team-supply" class="muted"></p><div id="team-requests"></div>';
 $('#team-list').after(board);
 const history=node('section',null,'team-activity');history.innerHTML='<h3>隊伍近況</h3><div id="team-activity-list"></div>';board.after(history);
 const unread=node('small','','team-unread');unread.id='team-unread';unread.hidden=true;$('#team-open').append(unread);
 const dialogs=[['teammate-dialog',`<div class="dialog-heading"><h2 id="teammate-title">與隊友同行</h2><button type="button" class="icon-button" aria-label="關閉隊友卡片">×</button></div><div id="teammate-profile" class="teammate-profile"></div><p id="teammate-life"></p><label>給隊友的一句話（選填）<textarea id="teammate-note" maxlength="200" rows="2" placeholder="今天也為你加油，一起慢慢長大。"></textarea></label><div class="team-social-actions"><button id="mate-bless" type="button" class="secondary">給祝福<small>MP＋10</small></button><button id="mate-pray" type="button" class="secondary">我已為你禱告<small>HP＋10／MP＋5</small></button><button id="mate-support" type="button" class="primary">活水支援<small>HP＋20／MP＋20</small></button></div><button id="mate-request" type="button" class="quiet-button">請這位隊友支援我</button><button id="mate-refresh" type="button" class="quiet-button">更新隊友狀況</button><p class="muted">同一隊友每種補給每天一次；每人每天最多接受 HP＋40、MP＋40，上限皆為 100。滿值仍能收到祝福與禱告。</p><p id="mate-status" class="status" role="status"></p>`],['team-request-dialog',`<div class="dialog-heading"><h2 id="team-request-title">向隊友求援</h2><button type="button" class="icon-button" aria-label="關閉支援請求">×</button></div><p id="team-request-audience" class="muted"></p><label>需要什麼陪伴？<select id="team-request-need"><option value="prayer">請為我禱告</option><option value="hp">需要 HP</option><option value="mp">需要 MP</option><option value="both">需要 HP／MP</option></select></label><label>想告訴隊友的話<textarea id="team-request-note" maxlength="200" rows="3" placeholder="今天有點累，請陪我一起禱告。"></textarea></label><button id="team-request-send" type="button" class="primary">送出隊內請求</button><p class="muted">每天最多三份請求。內容只向目前隊伍中指定的隊友顯示；給全隊的請求會出現在隊內看板。自己的手札不會被分享。</p><p id="team-request-status" class="status" role="status"></p>`]];
 dialogs.push(['team-invite-picker',`<div class="dialog-heading"><h2 id="team-invite-picker-title">邀請同工一起照顧小樹</h2><button type="button" class="icon-button" aria-label="關閉邀請名單">×</button></div><p class="muted">選一位已加入同工測試的人，邀請會直接出現在對方的小樹旁，不用傳連結或邀請碼。</p><p class="muted">送出邀請時，對方會看到你的姓名與 LINE 頭像；加入後隊友也能看到，之後可取消頭像分享。手札保持私人。</p><label>找一位同工<input id="team-invite-search" type="search" placeholder="搜尋同工姓名" autocomplete="off"></label><div id="team-invite-people"></div><p id="team-invite-picker-status" class="status" role="status"></p>`],['team-invite-offer',`<div class="dialog-heading"><h2 id="team-invite-offer-title">一起照顧小樹，好嗎？</h2><button type="button" class="icon-button" aria-label="關閉組隊邀請">×</button></div><div id="team-inviter-profile" class="teammate-profile"></div><p id="team-invite-offer-description"></p><p class="muted">接受後，隊友能看見你的姓名、可用的 LINE 頭像及 HP／MP；可隨時取消頭像分享。原本的讀經、裝備與成長進度都保留。</p><div class="team-request-actions"><button id="team-invite-accept" type="button" class="primary">接受邀請</button><button id="team-invite-decline" type="button" class="secondary">暫不加入</button></div><p id="team-invite-offer-status" class="status" role="status"></p>`]);
 for(const [id,markup] of dialogs){const d=node('dialog',null,'text-dialog team-social-dialog');d.id=id;d.setAttribute('aria-labelledby',({'teammate-dialog':'teammate-title','team-request-dialog':'team-request-title','team-invite-picker':'team-invite-picker-title','team-invite-offer':'team-invite-offer-title'})[id]);d.innerHTML=markup;document.body.append(d);d.querySelector('.icon-button').onclick=()=>{if(!busy)closeDialog(id);};d.addEventListener('cancel',e=>{e.preventDefault();if(!busy)closeDialog(id);});d.addEventListener('click',e=>{if(e.target===d&&!busy)closeDialog(id);});}
 function portrait(person){
  const wrap=node('span',null,'team-portrait');const fallback=()=>{const e=node('span',null,'team-avatar-fallback');if(person.avatar)e.innerHTML=renderAvatar(person.avatar);else e.textContent=(person.name||'隊友').slice(0,2);return e;};
  if(typeof person.picture==='string'&&/^https:\/\/([a-z0-9-]+\.)?line-scdn\.net\//.test(person.picture)){const img=node('img');img.src=person.picture;img.alt='';img.referrerPolicy='no-referrer';img.loading='lazy';img.onerror=()=>img.replaceWith(fallback());wrap.append(img);}else wrap.append(fallback());
  return wrap;
 }
 function lock(value){busy=value;for(const id of ['teammate-dialog','team-request-dialog','team-invite-picker','team-invite-offer']){$('#'+id).setAttribute('aria-busy',String(value));$('#'+id).querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=value||b.dataset.unavailable==='true');}$('#team-avatar-save').disabled=value;$('#team-avatar-share').disabled=value;$('#team-help-open').disabled=value||!team?.enabled;}
 async function act(kind,recipient=null,message='',target=null,need='prayer',status='#mate-status'){
  if(busy)return false;lock(true);$(status).textContent='正在保存這份陪伴…';
  try{const r=await send('social',{kind,recipient,message,target,need});render(r.team);const gift=r.care;const text=gift?.already_sent?'今天這份陪伴已送達，不會重複補充。':kind==='request'?'請求已送到隊內看板。':kind==='resolve'?'已標記得到幫助，謝謝隊友的陪伴。':`已送達：HP＋${gift?.hp_delta||0}、MP＋${gift?.mp_delta||0}。`;
   $(status).textContent=text;announce(text);return true;
  }catch(e){$(status).textContent=e.message+' 原有進度保留，可重試。';return false;}finally{lock(false);renderMate();}
 }
 function renderMate(){
  if(!chosen)return;chosen=team?.members?.find(p=>p.id===chosen.id)||null;
  if(!chosen){if($('#teammate-dialog').open)closeDialog('teammate-dialog');return;}
  $('#teammate-title').textContent=chosen.name+(chosen.self?'（你）':'');$('#teammate-profile').replaceChildren(portrait(chosen),node('span',chosen.read_today?'今天已一起讀經':'今天也一起慢慢長大'));
  $('#teammate-life').textContent=`信心 HP ${chosen.hp}／100 · 盼望 MP ${chosen.mp}／100`;
  for(const kind of ['bless','pray','support']){const b=$('#mate-'+kind),done=chosen.sent_kinds?.includes(kind);b.disabled=busy||chosen.self||done||(kind==='support'&&!team.supply);b.dataset.sent=String(done);b.title=done?'今天已送過':kind==='support'&&!team.supply?'完成今日讀經可取得一份活水支援，每日一次':'';}
  $('#mate-request').hidden=chosen.self;
 }
 function openMate(person){chosen=person;$('#teammate-note').value='';$('#mate-status').textContent='';renderMate();openDialog('teammate-dialog');}
 function openRequest(person=null){if(!team?.enabled)return;requestRecipient=person&&!person.self?person:null;$('#team-request-audience').textContent=requestRecipient?`這份請求只讓 ${requestRecipient.name} 與你看見。`:'這份請求讓目前全隊看見。';$('#team-request-note').value='';$('#team-request-status').textContent='';openDialog('team-request-dialog');}
 function markSeen(){const self=team?.members?.find(p=>p.self);if(!self)return;try{localStorage.setItem('mplus-team-seen:'+self.id,new Date().toISOString());}catch{}unread.hidden=true;}
 function render(value=getTeam()){
  if(!value)return;team=value;const members=team.members||[],self=members.find(p=>p.self);settings.hidden=!team.enabled;board.hidden=!team.enabled;history.hidden=!team.enabled;
  $('#team-avatar-share').checked=team.share_avatar===true;$('#team-supply').textContent=team.supply?'今天有 1 份活水支援，可補隊友 HP＋20、MP＋20。':'完成今天的讀經，可取得 1 份活水支援；每日一次。';
  orbit.replaceChildren();orbit.hidden=!team.enabled&&!(team.invitations||[]).length;if($('#life-team-help'))$('#life-team-help').hidden=!team.enabled;
  for(const invitation of team.invitations||[]){
   const button=node('button',null,'team-orbit-person team-invite-avatar');button.type='button';button.setAttribute('aria-label',invitation.name+' 邀請你組隊，點選接受或暫不加入');button.append(portrait(invitation),node('span',invitation.name,'team-person-name'),node('small','邀請你','team-person-badge'));button.onclick=()=>openInvitation(invitation);orbit.append(button);
  }
  if(chosenInvite&&!team.invitations?.some(i=>i.id===chosenInvite.id)&&$('#team-invite-offer').open)closeDialog('team-invite-offer');
  const list=$('#team-list');list.replaceChildren();
  for(const p of members){
   const button=node('button',null,'team-orbit-person');button.type='button';button.setAttribute('aria-label',`${p.name}${p.self?'，你':''}，HP ${p.hp}，MP ${p.mp}，點選祝福、禱告或支援`);button.append(portrait(p),node('span',p.name+(p.self?'（你）':''),'team-person-name'));
   const needs=(team.requests||[]).some(r=>r.sender_id===p.id);const badge=node('small',needs?'求援':p.read_today?'已讀經':'同行','team-person-badge');button.append(badge);button.onclick=()=>openMate(p);orbit.append(button);
   const row=node('button',null,'team-social-member');row.type='button';row.append(portrait(p),node('span',p.name+(p.self?'（你）':'')),node('small',`HP ${p.hp} · MP ${p.mp}`));row.onclick=()=>openMate(p);list.append(row);
  }
  if(team.enabled&&members.length===1)list.append(node('p','邀請一位已加入同工測試的家人，開始彼此祝福與支援。','muted'));
  $('#team-privacy').textContent='姓名、花園角色與 HP／MP 向隊友顯示；LINE 頭像由本人選擇分享。祝福與代禱訊息僅向相關隊友顯示，手札保持私人。';
  const requests=$('#team-requests');requests.replaceChildren();
  for(const r of team.requests||[]){const card=node('article',null,'team-request-card');card.append(node('strong',r.name+' · '+(NEED[r.need]||'需要陪伴')),node('p',r.message||'請陪我一起走過今天。'),node('small',r.status==='responded'?'已有隊友回應，願這份陪伴帶來力量。':'等待隊友回應'));
   const actions=node('div',null,'team-request-actions'),status=node('p','','status');status.setAttribute('role','status');
   if(r.mine){const b=node('button','已得到幫助','quiet-button');b.type='button';b.onclick=async()=>{await act('resolve',null,'',r.id,'prayer','#team-status');};actions.append(b);}
   else{const p=node('button','我已為你禱告','secondary');p.type='button';p.onclick=()=>void act('pray',r.sender_id,'我已為你禱告。',r.id,'prayer','#team-status');const help=node('button','送活水支援','primary');help.type='button';help.disabled=busy||!team.supply;help.onclick=()=>void act('support',r.sender_id,'我來陪你，一起得力。',r.id,r.need,'#team-status');actions.append(p,help);}
   card.append(actions,status);requests.append(card);
  }
  if(!(team.requests||[]).length)requests.append(node('p','目前沒有待回應的請求。有需要時，隊友可以陪你。','muted'));
  const feed=$('#team-activity-list');feed.replaceChildren(...(team.activity||[]).map(a=>node('p',`${a.name} ${LABEL[a.kind]||'陪伴你'}${a.recipient_name?' · '+a.recipient_name:''}${a.message?'：'+a.message:''}${a.hp||a.mp?`（HP＋${a.hp}／MP＋${a.mp}）`:''}`)));
  $('#received-care').replaceChildren();
  if(self){let seen='';try{seen=localStorage.getItem('mplus-team-seen:'+self.id)||'';}catch{}const count=(team.activity||[]).filter(a=>!a.mine&&a.created_at>seen).length;unread.textContent=count?'新陪伴 '+count:'';unread.hidden=!count;}
  const newest=team.activity?.[0];if(!firstRender&&newest&&newest.id!==lastFeed&&newest.to_me){banner.textContent=`${newest.name} ${LABEL[newest.kind]||'送來陪伴'} · HP＋${newest.hp||0}／MP＋${newest.mp||0}`;banner.hidden=false;setTimeout(()=>banner.hidden=true,4500);}lastFeed=newest?.id||'';firstRender=false;renderMate();
 }
 for(const kind of ['bless','pray','support'])$('#mate-'+kind).onclick=()=>void act(kind,chosen?.id,$('#teammate-note').value);
 $('#mate-request').onclick=()=>openRequest(chosen);$('#team-help-open').onclick=()=>openRequest();
 $('#mate-refresh').onclick=async()=>{if(busy)return;lock(true);try{const r=await send('team');render(r.team);$('#mate-status').textContent='隊友狀況已更新。';}catch(e){$('#mate-status').textContent=e.message;}finally{lock(false);renderMate();}};
 $('#team-request-send').onclick=async()=>{const need=$('#team-request-need').value;if(await act('request',requestRecipient?.id||null,$('#team-request-note').value,null,need,'#team-request-status'))closeDialog('team-request-dialog');};
 $('#team-avatar-save').onclick=async()=>{if(busy)return;const share=$('#team-avatar-share').checked;lock(true);$('#team-status').textContent='正在保存頭像設定…';try{const r=await send('profile',{shareAvatar:share});render(r.team);$('#team-status').textContent=share?'已同意向隊友顯示 LINE 頭像。':'已取消 LINE 頭像分享。';}catch(e){$('#team-status').textContent=e.message;$('#team-avatar-share').checked=team?.share_avatar===true;}finally{lock(false);}};
 const help=node('button','向隊友求援','quiet-button');help.type='button';help.id='life-team-help';$('#team-open').after(help);help.onclick=()=>openRequest();
 function openInvitation(invitation){chosenInvite=invitation;$('#team-inviter-profile').replaceChildren(portrait(invitation),node('strong',invitation.name+' 邀請你一起組隊'));$('#team-invite-offer-description').textContent=invitation.switch_team?'你目前已有隊伍。接受後會加入這位同工的隊伍，原小樹進度保留。':'接受後，就能在小樹旁看見隊友，彼此祝福、禱告與補給。';$('#team-invite-offer-status').textContent='';openDialog('team-invite-offer');}
 async function answerInvitation(accept){if(busy||!chosenInvite)return;lock(true);$('#team-invite-offer-status').textContent='正在保存你的選擇…';try{const r=await send('invite_answer',{invite:chosenInvite.id,accept});render(r.team);closeDialog('team-invite-offer');announce(accept?'已接受邀請，一起照顧這座花園吧。':'已選擇暫不加入，你的遊戲進度保留。');}catch(e){$('#team-invite-offer-status').textContent=e.message+' 可重試。';}finally{lock(false);}}
 $('#team-invite-accept').onclick=()=>void answerInvitation(true);$('#team-invite-decline').onclick=()=>void answerInvitation(false);
 let invitePeople=[];
 function renderInvitePeople(){const query=$('#team-invite-search').value.trim().toLocaleLowerCase();$('#team-invite-people').replaceChildren(...invitePeople.filter(p=>p.name.toLocaleLowerCase().includes(query)).map(person=>{const row=node('div',null,'team-invite-person');row.append(node('strong',person.name));const button=node('button',person.teammate?'已是隊友':'邀請一起組隊','secondary');button.type='button';button.dataset.unavailable=String(person.teammate);button.disabled=busy||person.teammate;button.onclick=async()=>{if(busy)return;lock(true);button.disabled=true;$('#team-invite-picker-status').textContent='正在送出邀請…';try{const r=await send('invite_person',{recipient:person.id});render(r.team);$('#team-invite-picker-status').textContent='已邀請 '+person.name+'。邀請人的頭像會出現在對方的小樹旁，等對方選擇是否接受。';button.textContent='邀請已送出';button.dataset.unavailable='true';}catch(e){$('#team-invite-picker-status').textContent=e.message;button.textContent='重試邀請';}finally{lock(false);}};row.append(button);return row;}));}
 $('#team-invite-search').oninput=renderInvitePeople;
 $('#team-invite').onclick=async()=>{if(busy)return;openDialog('team-invite-picker');lock(true);$('#team-invite-picker-status').textContent='正在讀取可邀請的同工…';try{const r=await send('invite_people');invitePeople=r.invitation?.people||[];$('#team-invite-picker-status').textContent=invitePeople.length?'邀請及接受都在遊戲內完成。':'目前沒有其他可邀請的同工。';}catch(e){$('#team-invite-picker-status').textContent=e.message;}finally{lock(false);renderInvitePeople();}};
 $('#team-dialog').addEventListener('close',markSeen);render();return {render};
}
