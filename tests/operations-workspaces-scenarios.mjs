export async function exerciseOperationsWorkspace(page,name,check,prefix){
 const ok=(v,label)=>check(v,prefix+' '+label),count=()=>page.evaluate(()=>t.calls.filter(c=>c.action!=='inventory_movements:insert').length),reads=()=>page.evaluate(()=>t.reads),fixture=values=>page.evaluate(values=>Object.assign(t,values),values);
 const editor=page.locator(name==='inventory'?'#editor-dialog':'#editor'),form=editor.locator('form');
 const field=editor.locator(name==='pastoral-inbox'?'textarea':name==='group-resources-management'?'#title':'input[name=name]');
 await field.fill('合成草稿保留');
 if(name==='inventory'){await editor.locator('[name=category]').fill('合成分類');await editor.locator('[name=total_quantity]').fill('3');}
 const start=await reads();await page.locator('#reload').evaluate(n=>n.click());ok(await reads()===start&&await editor.isVisible(),'cancelled dirty reload retains draft');
 const cancel=name==='group-resources-management'?editor.locator('#cancel'):editor.getByRole('button',{name:'取消',exact:true});await cancel.click();ok(await editor.isVisible(),'cancel requires draft confirmation');
 if(name!=='inventory'){await page.locator('#search').fill('不符合的關鍵字');ok(await field.inputValue()==='合成草稿保留'&&await reads()===start,'local filter preserves open draft');await page.locator('#search').fill('');}
 if(name==='pastoral-inbox'){
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  ok(!await editor.isVisible(),'background masks private editor');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelector('main').hasAttribute('data-private-paused'));
  ok(await field.inputValue()==='合成草稿保留'&&await count()===0,'authorized return restores unsaved care draft without writing');
 }
 await fixture({writeFail:true});await form.evaluate(f=>f.requestSubmit());
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('合成儲存失敗')||document.querySelector('#editor-message')?.textContent.includes('未儲存'));
 ok(await count()===1&&await field.inputValue()==='合成草稿保留','failed write preserves fields');
 await fixture({writeFail:false,afterReadFail:true,delay:100});await form.evaluate(f=>{f.requestSubmit();f.requestSubmit();});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('勿重複送出'));
 ok(await count()===2&&!await editor.isVisible(),'one acknowledged save despite double submission and failed refresh');
 ok((await page.locator('#status').textContent()).includes('已儲存'),'write success distinguished from refresh failure');
 await fixture({readFail:false,afterReadFail:false,delay:30});await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已載入'));ok(await count()===2,'recovery only reads');
 if(name==='spaces'){
  await page.locator('#booking-state').selectOption('已核准');ok(await page.locator('#bookings article').count()===1,'booking status filter');await page.locator('#clear-filter').click();ok(await page.locator('#bookings article').count()===2,'clear filters restores bookings');
  await page.locator('#new-booking').click();await editor.locator('[name=applicant_name]').fill('合成申請');await editor.locator('[name=end_time]').fill('08:00');await form.evaluate(f=>f.requestSubmit());ok(await count()===2,'end before start rejected');
  await editor.locator('[name=end_time]').fill('10:00');await form.evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('預約已建立'));ok(await count()===3,'valid booking uses existing service');
 }else if(name==='amenities'){
  await page.locator('#toggle').click();ok((await page.locator('#items').textContent()).includes('合成舊設備')&&await page.locator('#items article').count()===1,'inactive equipment filter');await page.locator('#toggle').click();
 }else if(name==='pastoral-inbox'){
  await page.locator('#state').selectOption('處理中');ok(await page.locator('#items article').count()===1,'care status filter');await page.locator('#clear-filter').click();ok(await page.locator('#items article').count()===2,'clear care filters');ok(await page.evaluate(()=>t.calls.every(c=>c.action==='pastoral')),'care changes do not dispatch notifications');
 }else if(name==='group-resources-management'){
  await page.locator('#filter-state').selectOption('published');ok(await page.locator('#items button').count()===1,'publication status filter');const last=await page.evaluate(()=>t.calls.at(-1));ok(last.input.filters.some(([k,v])=>k==='church_id'&&v==='M+')&&last.input.filters.some(([k,v])=>k==='content_type'&&v==='group_resource'),'resource write scoped to church and content type');
 }else if(name==='inventory'){
  await page.locator('#availability-filter').selectOption('attention');ok(await page.locator('#items button').count()===1&&(await page.locator('#items').textContent()).includes('投影'),'needs attention filter');await page.locator('#clear-filter').click();ok(await page.locator('#items button').count()===3,'clear inventory filters');
 }
 await fixture({allowed:false});await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('權限')&&!document.querySelector('main').hasAttribute('aria-busy'));
 ok(await page.locator(name==='spaces'?'#rooms article':name==='inventory'?'#items button':name==='group-resources-management'?'#items button':'#items article').count()===0,'permission denial clears data');
 await fixture({allowed:true,delay:120});await page.locator('#reload').click();await page.evaluate(()=>{t.allowed=false;fireAuth('SIGNED_OUT');});await page.waitForTimeout(200);
 ok(!(await page.locator('main').textContent()).includes('合成私人備註'),'sign out clears private content');
 ok(await page.locator(name==='spaces'?'#rooms article':name==='inventory'?'#items button':name==='group-resources-management'?'#items button':'#items article').count()===0,'late read cannot restore signed out data');
}
