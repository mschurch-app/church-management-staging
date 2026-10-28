// Synthetic data only; used with the real receipt UI in a local preview.
export const receiptBootstrap=`<script>
window.receiptFixture={calls:[],rows:[],issuer:{name:'合成協會',tax_number:'12345678',address:'合成地址',money_prefix:'MONEY',goods_prefix:'GOODS',money_last_serial:0,goods_last_serial:0,version:1}};
window.receiptInvoke=async({body:b})=>{const f=receiptFixture;f.calls.push(b);await fetch('/__receipt',{method:'POST',body:JSON.stringify(b)});let data={ok:true};
if(b.action==='profile')data={...data,canEdit:true,canIssue:true,canCamp:true,canExport:true,owner:true,firstYear:2026,issuer:f.issuer};
if(b.action==='list')data.receipts=f.rows.filter(r=>r.kind===b.kind);
if(b.action==='get')data={...data,receipt:f.rows.find(r=>r.id===b.id),events:[]};
if(b.action==='save'){const d=b.data,r={id:b.id,version:(b.version||0)+1,state:'draft',kind:d.kind,donation_date:d.donationDate,project:d.project,donor_name:d.donorName,recipient_name:d.recipientName,recipient_address:d.recipientAddress,source_ref:d.sourceRef,amount:d.amount?Number(d.amount):null,items:d.items,valuation_basis:d.valuationBasis,created_at:new Date().toISOString()};f.rows=f.rows.filter(x=>x.id!==b.id);f.rows.push(r);data.receipt=r;}
if(b.action==='issue'){const r=f.rows.find(r=>r.id===b.id);Object.assign(r,{state:'issued',version:r.version+1,receipt_number:(r.kind==='money'?'MONEY':'GOODS')+'-2026-000001',issuer_snapshot:f.issuer,issued_at:new Date().toISOString()});data.receipt=r;}
if(b.action==='void'){const r=f.rows.find(r=>r.id===b.id);Object.assign(r,{state:'voided',version:r.version+1,void_reason:b.reason});data.receipt=r;}
if(b.action==='issuer'){f.issuer={name:b.data.name,tax_number:b.data.taxNumber,address:b.data.address,money_prefix:b.data.moneyPrefix,goods_prefix:b.data.goodsPrefix,version:2};data.issuer=f.issuer;}
if(b.action==='camp_list')data.registrations=[{registration_no:'SYNTH-CAMP-001',guardian_name:'合成家長',player_name:'合成學員',amount:3000,paid_at:'2026-10-28T01:00:00Z',trade_no:'SYNTH-TRADE',receipt_no:f.campReceipt?.receipt_no||null}];
if(b.action==='camp_issue'){f.campReceipt={receipt_no:'B116-SYNTHETIC-0001',status:'issued',amount:3000,paid_at:'2026-10-28T01:00:00Z',issued_at:'2026-10-28T02:00:00Z',payer_name:'合成家長',receipt_title:'合成家長',registration_no:b.registrationNo,trade_no:'SYNTH-TRADE'};data.campReceipt=f.campReceipt;}
if(b.action==='camp_get')data.campReceipt=f.campReceipt;
if(b.action==='export')data.receipts=f.rows.filter(r=>r.amount!==null&&r.state!=='draft').map(r=>({receipt_number:r.receipt_number,category:r.kind==='goods'?'物品':'金錢',record_date:r.donation_date,project:r.project,payer:r.donor_name,title:r.recipient_name,amount:r.amount,status:r.state,source_ref:r.source_ref,items:r.items}));
if(b.action==='export'&&f.campReceipt)data.receipts.push({receipt_number:f.campReceipt.receipt_no,category:'籃球營報名費',record_date:'2026-10-28',project:'合成籃球營',payer:'合成家長',title:'合成家長',amount:3000,status:'issued',source_ref:'SYNTH-CAMP-001',items:[]});
return {data,error:null};};
</script>`;
