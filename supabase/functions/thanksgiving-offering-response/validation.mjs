export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL=/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
export function validateResponse(raw,{today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
 const keys=['donor_name','method','donation_date','amount_ntd','remitter_account_last5','contact_email','contact_phone','note','consent','source','website'];
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).some(k=>!keys.includes(k)))throw Error('invalid_input');
 const limits={donor_name:60,method:20,donation_date:10,remitter_account_last5:5,contact_email:120,contact_phone:20,note:300,source:30,website:200};
 const out={};for(const [key,max]of Object.entries(limits)){const value=raw[key]??'';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error('invalid_input');out[key]=value.trim();}
 if(out.website)throw Error('bot_rejected');delete out.website;
 if(!out.donor_name||!['bank_transfer','online'].includes(out.method)||out.source!=='thanksgiving_2026'||raw.consent!==true)throw Error('invalid_input');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(out.donation_date)||!Number.isFinite(Date.parse(out.donation_date))||new Date(out.donation_date).toISOString().slice(0,10)!==out.donation_date||out.donation_date<'2026-01-01'||out.donation_date>today)throw Error('invalid_date');
 if(!Number.isSafeInteger(raw.amount_ntd)||raw.amount_ntd<1||raw.amount_ntd>100000000)throw Error('invalid_amount');
 if((out.method==='bank_transfer'||out.remitter_account_last5)&&!/^\d{5}$/.test(out.remitter_account_last5))throw Error('invalid_last5');
 if(!out.contact_email&&!out.contact_phone)throw Error('contact_required');
 if(out.contact_email&&!EMAIL.test(out.contact_email))throw Error('invalid_email');
 if(out.contact_phone&&!/^\+?[0-9 ()-]{6,20}$/.test(out.contact_phone))throw Error('invalid_phone');
 return {...out,amount_ntd:raw.amount_ntd,consent:true};
}
export function notificationText(item){
 const p=item.payload;
 return ['【M+ 大雅教會｜感恩節奉獻回報】',item.is_test?'【合成驗收資料，請勿記帳】':'待財務核對，尚未確認實收',`回報編號：${item.reference_no}`,`奉獻人：${p.donor_name}`,`奉獻日期：${p.donation_date}`,`金額：NT$ ${p.amount_ntd}`,`方式：${p.method==='bank_transfer'?'銀行匯款':'線上奉獻'}`,`匯款帳號末五碼：${p.remitter_account_last5||'未提供'}`,'請登入教會 OS 查看與對帳：','https://mscos.mchurch.online/thanksgiving-offering-admin.html?church=M%2B'].join('\n');
}
