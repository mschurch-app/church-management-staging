import {makeMemberClient} from './member-client.mjs';
// Release gate: keep empty until server deployment, limiter and staging pass.
export const MEMBER_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/member-access';
export function mountMemberPanel(){
  const form=document.querySelector('#formSection'),panel=document.createElement('section');panel.className='p-4 my-4 rounded-xl border border-stone-300 bg-white';panel.id='memberIdentityPanel';
  form.before(panel);form.hidden=true;
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  let client;
  const button=(label,fn)=>{const el=text('button',label);el.type='button';el.className='p-2 m-1 rounded border';el.addEventListener('click',()=>Promise.resolve().then(fn).catch(()=>{}));return el;};
  function render(result){
    panel.replaceChildren(text('h2','歡迎回家 · 會友資料確認'));
    const message=text('p','');message.setAttribute('role','status');panel.append(message);
    const messages={signed_out:'登入 LINE 後即可確認是否已在會友名冊中。',loading:'正在確認 LINE 身份與名冊資料，請稍候…',unbound:'這個 LINE 帳號尚未連結會友名冊。若你已是會友，送出申請並由同工核對；核准後會自動帶入原有資料。',pending:'綁定申請已收到，等待同工核准；核准後即可查看並更新已連結的資料。',approved:'已確認為會友，新朋友專用表單已隱藏。下方資料已從名冊帶入，可直接修正後儲存。',rejected:'綁定申請未獲核准，請先聯絡教會同工核對。',revoked:'綁定已撤銷，目前不能查看或修改會員資料。',error:'目前無法確認身份或儲存結果，請重新查詢。'};
    message.textContent=messages[result.state]||'無法確認身份。';
    if(result.state==='signed_out')panel.append(button('登入 LINE',()=>client.login()));
    if(result.state!=='loading')panel.append(button('重新查詢狀態',()=>client.connect()));
    if(result.state==='approved'){
      form.hidden=true;
      if(result.member?.name)panel.append(text('p','會友姓名：'+result.member.name));
      if(result.member?.group_name)panel.append(text('p','所屬小組／小家：'+result.member.group_name));
    }else{
      const firstTime=button('我是第一次來／新朋友登記',()=>{form.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});});
      firstTime.className='p-2 m-1 rounded bg-emerald-700 text-white';panel.append(firstTime);
    }
    if(['unbound','rejected','revoked'].includes(result.state)){
      const name=document.createElement('input'),phone=document.createElement('input');
      name.placeholder='會員姓名';name.maxLength=80;name.setAttribute('aria-label','申請綁定的會員姓名');
      phone.placeholder='聯絡電話';phone.type='tel';phone.maxLength=40;phone.setAttribute('aria-label','申請綁定的聯絡電話');
      panel.append(name,phone,button('送出綁定申請',()=>{
        if(!name.value.trim()||!phone.value.trim()){message.textContent='請填寫姓名與聯絡電話。';return;}
        return client.request(name.value.trim(),phone.value.trim());
      }));
    }
    if(result.state==='approved'){
      const fields={};
      for(const [key,label,max] of [['phone','電話',40],['district','地區',100],['birthday','生日',10],['gender','性別',40]]){
        const wrapper=text('label',label+' '),input=document.createElement('input');
        input.type=key==='birthday'?'date':key==='phone'?'tel':'text';input.maxLength=max;
        input.value=result.member?.[key]??'';wrapper.append(input);panel.append(wrapper);fields[key]=input;
      }
      panel.append(text('p','這些資料已從會友名冊帶入。小組／小家編組由同工維護，如需調整請聯絡同工。'));
      panel.append(button('儲存本人資料',()=>client.update(Object.fromEntries(Object.entries(fields).map(([key,el])=>[key,el.value])))));
    }
  }
  if(!MEMBER_ENDPOINT){panel.append(text('h2','既有會友資料'),text('p','身份綁定功能尚未開放，請聯絡教會同工。'),button('以新朋友身份登記',()=>{form.hidden=false;}));return;}
  try{
    client=makeMemberClient({liff:window.liff,search:location.search,onState:render,send:async body=>{
      const response=await fetch(MEMBER_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('unavailable');return response.json();
    }});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)client.clear();else client.connect().catch(()=>{});});
    window.addEventListener('pagehide',()=>client.clear());
    client.connect().catch(()=>{});
  }catch{panel.replaceChildren(text('h2','既有會友資料'),text('p','目前無法啟動 LINE 身份確認；若是第一次來訪，可選擇新朋友登記。'),button('以新朋友身份登記',()=>{form.hidden=false;}));}
}
