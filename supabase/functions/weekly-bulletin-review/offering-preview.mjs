import {buildBulletinPreview} from './finance-bulletin.mjs';
import {previousSunday} from './weekly-offering.mjs';
async function paged(make){let rows=[];for(let start=0;start<20000;start+=1000){const result=await make().order('id',{ascending:true}).range(start,start+999);if(result.error||!Array.isArray(result.data))throw Error('offering_unavailable');rows.push(...result.data);if(result.data.length<1000)return rows;}throw Error('offering_too_large');}
async function byIds(ids,make){const rows=[];for(let i=0;i<ids.length;i+=100)rows.push(...await paged(()=>make(ids.slice(i,i+100))));return rows;}
export async function loadWeeklyOfferingPreview(db,serviceDate){
 const offeringDate=previousSunday(serviceDate),generatedAt=new Date().toISOString();
 const batches=await paged(()=>db.from('finance_cash_batches').select('id,status,entered_total,counted_cash').eq('church_id','M+').eq('offering_date',offeringDate));
 if(!batches.length)return {status:'empty',offeringDate,generatedAt,message:'上週主日尚無會計奉獻資料。'};
 if(batches.some(b=>b.status!=='booked'))return {status:'pending',offeringDate,generatedAt,message:'上週奉獻尚未全部核准入帳，暫不帶入。'};
 const bags=await byIds(batches.map(b=>b.id),ids=>db.from('finance_cash_bags').select('id,batch_id,bag_name,member_id,offering_code,payment_method,anonymous,public_choice,hide_from_bulletin').in('batch_id',ids));
 const lines=await byIds(bags.map(b=>b.id),ids=>db.from('finance_cash_lines').select('id,bag_id,category,designation,amount').in('bag_id',ids));
 const byBag=new Map(bags.map(b=>[b.id,b])),batchTotals=new Map(batches.map(b=>[b.id,0])),cashTotals=new Map(batches.map(b=>[b.id,0])),paymentTotals={cash:0,transfer:0,online:0};
 const donations=lines.map(line=>{const bag=byBag.get(line.bag_id);if(!bag)throw Error('offering_unavailable');const amount=Number(line.amount);batchTotals.set(bag.batch_id,batchTotals.get(bag.batch_id)+amount);const method=bag.payment_method||'cash';if(!Object.hasOwn(paymentTotals,method))throw Error('offering_unavailable');paymentTotals[method]+=amount;if(method==='cash')cashTotals.set(bag.batch_id,cashTotals.get(bag.batch_id)+amount);return {id:line.id,projectId:'mplus',offeringDate,status:'booked',category:line.category,designation:line.designation,amount,memberId:bag.member_id,offeringCode:bag.offering_code,bagName:bag.bag_name,anonymous:bag.anonymous,publicChoice:bag.public_choice,hideFromBulletin:bag.hide_from_bulletin};});
 if(batches.some(b=>batchTotals.get(b.id)!==Number(b.entered_total)||cashTotals.get(b.id)!==Number(b.counted_cash)||Number(b.entered_total)<=0))throw Error('offering_unavailable');
 return {status:'ready',paymentTotals,...buildBulletinPreview(donations,{projectId:'mplus',offeringDate}),generatedAt};
}
