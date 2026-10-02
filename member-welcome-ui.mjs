import {makeMemberClient} from './member-client.mjs';
export const MEMBER_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/member-access';
export function mountMemberPanel(){
  const form=document.querySelector('#formSection'),host=form?.parentElement;
  if(!form||!host)return;
  const selectedChurch=new URLSearchParams(location.search).get('church');
  const churchName=selectedChurch==='SHiNE'?'火樂':'M＋';
  const groupName=selectedChurch==='SHiNE'?'小家':'小組';
  const panel=document.createElement('section');
  panel.className='card-glass p-6 sm:p-8 mb-4 space-y-5';
  panel.id='memberIdentityPanel';
  host.insertBefore(panel,form);
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  let client,newcomerMode=false;
  const button=(label,fn,secondary=false)=>{const el=text('button',label);el.type='button';el.className=secondary?'w-full py-3 rounded-2xl border border-stone-200 bg-white text-stone-700 text-xs font-black':'w-full py-3.5 rounded-2xl btn-submit text-white text-xs font-black';el.addEventListener('click',()=>Promise.resolve().then(fn).catch(()=>{}));return el;};
  const field=(label,type='text')=>{const wrapper=text('label','');wrapper.className='block space-y-1.5 text-xs font-black text-stone-700';wrapper.append(text('span',label));const input=document.createElement('input');input.type=type;input.className='w-full bg-stone-50 border border-stone-200 rounded-2xl p-3.5 text-stone-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-400 text-sm';wrapper.append(input);return{wrapper,input};};
  const profileCard=member=>{
    const card=document.createElement('div');card.className='rounded-3xl bg-gradient-to-br from-teal-800 to-teal-950 p-5 text-white shadow-lg shadow-teal-900/10';
    const head=document.createElement('div');head.className='flex items-center gap-3';
    const avatar=text('span',String(member.name||'家').trim().slice(0,1)||'家');avatar.className='grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-xl font-black ring-1 ring-white/20';
    const identity=document.createElement('div');identity.className='min-w-0';
    const name=text('h3',member.name||'教會家人');name.className='truncate text-lg font-black';
    const group=text('p',member.group_name?`所屬${groupName}｜${member.group_name}`:'目前尚未編組');group.className='mt-0.5 text-xs font-bold text-teal-50/80';
    identity.append(name,group);head.append(avatar,identity);card.append(head);
    const details=[['年齡層',member.age_group],['信仰近況',member.faith_status],['受洗日期',member.baptism_date],['聚會近況',member.growth_progress]].filter(([,value])=>String(value||'').trim());
    if(details.length){const grid=document.createElement('dl');grid.className='mt-4 grid grid-cols-2 gap-2';for(const [label,value] of details){const item=document.createElement('div');item.className='rounded-2xl bg-white/10 px-3 py-2.5';const term=text('dt',label);term.className='text-[10px] font-bold tracking-wide text-teal-50/65';const description=text('dd',value);description.className='mt-0.5 text-xs font-black leading-relaxed';item.append(term,description);grid.append(item);}card.append(grid);}
    return card;
  };
  const showForm=value=>{form.classList.toggle('hidden',!value);};
  const normalizePhone=value=>{const digits=String(value||'').replace(/\D/g,'');if(/^8869\d{8}$/.test(digits))return '0'+digits.slice(3);if(/^09\d{8}$/.test(digits))return digits;return'';};
  function render(result){
    panel.replaceChildren();
    const eyebrow=text('p','LINE MEMBER · 既有家人辨識');eyebrow.className='text-[11px] font-black tracking-[.16em] text-teal-700';
    const title=text('h2','歡迎回家');title.className='text-xl font-black text-stone-800';
    const message=text('p','');message.className='text-xs leading-relaxed text-stone-600';message.setAttribute('role','status');panel.append(eyebrow,title,message);
    const messages={signed_out:'請先登入 LINE，系統會確認是否已綁定會友資料。',loading:'正在確認你的 LINE 綁定狀態…',unbound:`如果你已經是${churchName}家人，請留下姓名與手機，由同工確認後完成綁定。`,pending:'申請已收到，正在等待同工核准；核准後會自動帶入你的資料。',approved:'已確認為教會家人。請核對下列資料，需要時可以直接修正。',rejected:'這次申請尚未通過，請確認姓名與手機後重新提出。',revoked:'原有綁定已撤銷，如需恢復請重新提出申請。',error:'目前無法確認身份，請稍後重新查詢。'};
    message.textContent=messages[result.state]||'無法確認身份。';
    if(newcomerMode){panel.hidden=true;showForm(true);return;}
    panel.hidden=false;showForm(false);
    if(result.state==='signed_out')panel.append(button('使用 LINE 確認身份',()=>client.login()));
    if(['pending','error'].includes(result.state))panel.append(button('重新查詢狀態',()=>client.connect(),true));
    if(['unbound','rejected','revoked'].includes(result.state)){
      const name=field('會友姓名'),phone=field('手機號碼','tel');
      name.input.placeholder='請輸入會友名冊上的姓名';name.input.maxLength=80;
      phone.input.placeholder='0912-345-678';phone.input.inputMode='tel';phone.input.maxLength=20;
      panel.append(name.wrapper,phone.wrapper,button('送出 LINE 綁定申請',()=>{
        const mobile=normalizePhone(phone.input.value);
        if(!name.input.value.trim()){message.textContent='請輸入會友姓名。';return;}
        if(!mobile){message.textContent='請輸入正確的台灣手機號碼。';return;}
        return client.request(name.input.value.trim(),mobile);
      }),button('我是第一次來，填寫新朋友資料',()=>{newcomerMode=true;panel.hidden=true;showForm(true);},true));
    }
    if(result.state==='approved'){
      panel.append(profileCard(result.member||{}));
      const hint=text('p','以下是目前留存的基本資料；有變動可以直接修改。');hint.className='text-xs font-bold leading-relaxed text-stone-500';panel.append(hint);
      const fields={};
      for(const [key,label,max] of [['phone','電話',40],['district','地區',100],['birthday','生日',10],['gender','性別',40]]){
        const item=field(label,key==='birthday'?'date':key==='phone'?'tel':'text'),input=item.input;input.maxLength=max;
        input.value=result.member?.[key]??'';panel.append(item.wrapper);fields[key]=input;
      }
      panel.append(button('確認並儲存資料',()=>client.update(Object.fromEntries(Object.entries(fields).map(([key,el])=>[key,el.value])))));
    }
  }
  if(!MEMBER_ENDPOINT){panel.append(text('h2','既有會員資料更新'),text('p','身份綁定功能尚未開放，請聯絡教會同工。'));return;}
  try{
    client=makeMemberClient({liff:window.liff,search:location.search,onState:render,send:async body=>{
      const response=await fetch(MEMBER_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('unavailable');return response.json();
    }});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)client.clear();else if(!newcomerMode)client.connect().catch(()=>{});});
    window.addEventListener('pagehide',()=>client.clear());
    client.connect().catch(()=>{});
  }catch{panel.replaceChildren(text('p','目前無法確認 LINE 身份，請稍後重試。'));showForm(true);}
}
