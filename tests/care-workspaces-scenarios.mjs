// UI contracts with synthetic data services. No production account or writes.
export async function exerciseCareWorkspace(page,name,check,prefix){
 const ok=(value,label)=>check(value,prefix+' '+label),status=page.locator('#status');
 const fixture=patch=>page.evaluate(p=>Object.assign(t,p),patch);
 const count=()=>page.evaluate(()=>t.calls.length);
 const reads=()=>page.evaluate(()=>t.reads);
 const settled=()=>page.waitForFunction(()=>!document.querySelector('#status').textContent.includes('正在'));
 let accept=false;page.removeAllListeners('dialog');page.on('dialog',dialog=>accept?dialog.accept():dialog.dismiss());
 if(name==='group-members'){
  ok(await page.locator('#assign').isDisabled(),'explicit member selection required');
  const start=await reads();await page.locator('#current-search').fill('乙');ok(await page.locator('#current article').count()===1,'current member search');
  await page.locator('#current-search').fill('');await page.locator('#available-search').fill('己');ok(await page.locator('#available option').count()===2,'available member search');
  ok(await reads()===start,'search stays local');await page.locator('#available').selectOption('6');await page.locator('#assign').click();ok(await count()===0,'cancel move sends nothing');
  accept=true;await fixture({afterReadFail:true,delay:100});await page.locator('#assign').evaluate(node=>{node.click();node.click();});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('清單尚未更新'));
  ok(await count()===1,'duplicate move guarded');ok((await status.textContent()).includes('成員所屬已更新'),'acknowledged move separated from refresh failure');ok(await page.locator('#assign').isDisabled(),'stale list cannot mutate');
  await fixture({readFail:false,afterReadFail:false,delay:30});await page.locator('#reload').click();await settled();ok(await count()===1&&await page.locator('#current article').count()===4,'read retry reflects saved membership without resend');
  await fixture({writeFail:true});await page.locator('#current article').filter({hasText:'合成會友乙'}).getByRole('button',{name:/設為/}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('合成儲存失敗'));
  ok((await page.locator('#group-count').textContent()).includes('合成會友甲'),'failed leader change preserves leader');
  await fixture({writeFail:false});await page.locator('#current article').filter({hasText:'合成會友己'}).getByRole('button',{name:'移出',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='成員所屬已更新。');ok(await page.locator('#current article').count()===3,'remove member result reflected');
 }else if(name==='newcomer-care'){
  const editor=page.locator('#care-editor');ok(await editor.locator('[name=nextFollowUpAt]').inputValue()==='2026-10-23T18:00','Taipei local time retained');
  await editor.locator('[name=summary]').fill('尚未儲存的合成關懷內容');await page.locator('#filter').selectOption('all');ok(await page.locator('#filter').inputValue()==='open'&&await editor.isVisible(),'cancel filter preserves editor and filter');
  await page.getByRole('button',{name:'開啟關懷紀錄',exact:true}).nth(1).click();ok((await editor.locator('h2').textContent()).includes('甲'),'cancel changing case preserves selection');
  await editor.getByRole('button',{name:'取消',exact:true}).click();ok(await editor.locator('[name=summary]').inputValue()==='尚未儲存的合成關懷內容','cancel discard preserves input');
  await fixture({writeFail:true});await editor.getByRole('button',{name:'儲存關懷紀錄',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#care-editor .editor-result').textContent.includes('合成儲存失敗'));ok(await editor.locator('[name=summary]').inputValue()==='尚未儲存的合成關懷內容','failed save preserves draft');
  await fixture({writeFail:false,afterReadFail:true,delay:100});await editor.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('勿重複新增'));
  ok(await count()===2,'double save adds one service call');ok(await editor.isHidden()&&(await status.textContent()).includes('已儲存'),'saved draft cleared even when read fails');ok(await page.getByRole('button',{name:'開啟關懷紀錄',exact:true}).first().isDisabled(),'stale case cannot append another log');
  const payload=await page.evaluate(()=>t.calls.at(-1).input);ok(payload.nextFollowUpAt==='2026-10-23T10:00:00.000Z'&&payload.summary==='尚未儲存的合成關懷內容','care payload retains date and summary');
  await fixture({readFail:false,afterReadFail:false,delay:30});await page.locator('#refresh').click();await settled();ok(await count()===2,'refresh never repeats saved care log');
  const start=await reads();await page.locator('#care-search').fill('乙');await page.locator('#care-search-apply').click();ok(await page.locator('#cases article').count()===1&&await reads()===start,'case search applies locally');
  await page.getByRole('button',{name:'開啟關懷紀錄',exact:true}).click();await editor.getByRole('button',{name:'完成關懷',exact:true}).click();ok(await count()===2,'cancel completion sends nothing');accept=true;await editor.getByRole('button',{name:'完成關懷',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已完成這位'));ok(await page.locator('#cases article').count()===0&&await page.evaluate(()=>t.calls.at(-1).input.close===true),'completion hides case from open filter');
 }else if(name==='binding-review'){
  const card=page.locator('#requests article').first(),select=card.locator('select'),verified=card.locator('input[type=checkbox]');
  await card.getByRole('button',{name:'核准綁定',exact:true}).click();ok(await count()===0,'no approval without candidate and verification');
  await card.getByRole('button',{name:'查詢會友',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#requests select').options.length>1);ok(await select.inputValue()==='','candidate not automatically selected');
  await select.selectOption('1');await verified.check();await select.selectOption('2');ok(!await verified.isChecked(),'changing candidate resets verification');await verified.check();
  const start=await reads();await page.locator('#request-search').fill('申請乙');await page.locator('#request-search').fill('');ok(await select.inputValue()==='2'&&await verified.isChecked()&&await reads()===start,'local search preserves reviewed selection');
  await page.locator('#request-state').selectOption('approved');ok(await page.locator('#requests article:visible').count()===1,'status filter');await page.locator('#request-state').selectOption('all');
  await fixture({delay:150});await card.getByRole('button',{name:'查詢會友',exact:true}).click();await card.locator('input[type=text],input:not([type])').first().fill('己');await page.waitForFunction(()=>!document.querySelector('#requests article button').disabled);ok(await select.locator('option').count()===1&&!await verified.isChecked(),'stale candidate response discarded after name change');
  await fixture({delay:30});await card.getByRole('button',{name:'查詢會友',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#requests select').options.length>1);await select.selectOption('6');await verified.check();await fixture({writeFail:true});await card.getByRole('button',{name:'核准綁定',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('合成儲存失敗'));ok(await select.inputValue()==='6'&&await verified.isChecked(),'failed approval preserves reviewed inputs');
  await fixture({writeFail:false,afterReadFail:true,delay:100});await card.getByRole('button',{name:'核准綁定',exact:true}).evaluate(node=>{node.click();node.click();});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('勿重複處理'));ok(await count()===2&&(await status.textContent()).includes('綁定已核准'),'approval single dispatch with acknowledged refresh failure');ok(await page.locator('#requests article').count()===0,'failed refresh removes stale binding actions');
  await fixture({readFail:false,afterReadFail:false,delay:30});await page.locator('#reload').click();await settled();ok(await count()===2,'binding retry only reads');
  const approved=page.locator('#requests article[data-state=approved]').first();await approved.getByRole('button',{name:'撤銷本人更新權限',exact:true}).click();ok(await count()===2,'revoke requires explicit checkbox');await approved.locator('input[type=checkbox]').check();await approved.getByRole('button',{name:'撤銷本人更新權限',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('綁定已撤銷'));ok(await page.evaluate(()=>t.calls.at(-1).input.action==='revoke'),'confirmed revoke dispatches');
 }else if(name==='member-audit'){
  ok(await page.locator('#audit-list article').count()===50,'initial recent fifty');ok(!(await page.locator('#audit-list').textContent()).includes('MUST_NOT_RENDER_PRIVATE_VALUE'),'audit never displays old or new private values');
  const start=await reads();await page.locator('#audit-action').selectOption('archive');await page.locator('#audit-member').fill('3');ok(await page.locator('#audit-list article').count()>0&&await reads()===start,'audit filters locally');ok(await page.locator('#audit-list article').evaluateAll(nodes=>nodes.every(n=>n.textContent.includes('封存')&&n.textContent.includes('會友編號：3'))),'action and exact member ID combined');
  await page.locator('#audit-member').fill('30');ok(await page.locator('#audit-list article').count()===0,'member ID is exact match');await page.locator('#audit-member').fill('');await page.locator('#audit-action').selectOption('all');
  await fixture({readFail:true});await page.locator('#more').click();await settled();ok(await page.locator('#audit-list article').count()===50&&await page.locator('#more').isVisible(),'failed pagination preserves last loaded page');
  await fixture({readFail:false});await page.locator('#more').click();await settled();ok(await page.locator('#audit-list article').count()===100&&await page.locator('#more').isHidden(),'pagination stops at service maximum');ok(await count()===0,'audit browsing sends no writes');
 }else if(name==='prayers'){
  const editor=page.locator('#editor');await editor.locator('[name=pastoral_notes]').fill('合成草稿不公開');const start=await reads();await page.locator('#reload').click();ok(await reads()===start&&await editor.isVisible(),'dirty reload cancelled');await page.locator('#add-prayer').click();ok(await editor.locator('[name=pastoral_notes]').inputValue()==='合成草稿不公開','dirty new record cancelled');
  await page.locator('#search').fill('工作');ok(await editor.locator('[name=pastoral_notes]').inputValue()==='合成草稿不公開'&&await page.locator('#items article').count()===1,'list search preserves editor');await page.locator('#search').fill('');await editor.getByRole('button',{name:'取消',exact:true}).click();ok(await editor.isVisible(),'dirty cancel requires confirmation');
  await fixture({writeFail:true});await editor.getByRole('button',{name:'儲存關懷紀錄',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor [role=status]').textContent.includes('合成儲存失敗'));ok(await editor.locator('[name=pastoral_notes]').inputValue()==='合成草稿不公開','failed prayer save preserves notes');
  await fixture({writeFail:false,afterReadFail:true,delay:100});await editor.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('勿重複儲存'));ok(await count()===2&&await editor.isHidden(),'single prayer save and acknowledged draft cleared');ok((await status.textContent()).includes('已儲存')&&await page.locator('#items article').count()===0,'prayer acknowledgement survives failed refresh');
  const payload=await page.evaluate(()=>t.calls.at(-1).input);ok(payload.pastoral_notes==='合成草稿不公開'&&!Object.hasOwn(payload,'is_private'),'edit retains private notes field without changing visibility');
  await fixture({readFail:false,afterReadFail:false,delay:30});await page.locator('#reload').click();await settled();ok(await count()===2,'prayer refresh does not resend');
  await page.locator('#add-prayer').click();await editor.getByLabel('代禱對象／稱呼',{exact:true}).fill('合成新對象');await editor.getByLabel('代禱主題',{exact:true}).fill('合成新代禱');await editor.getByLabel('代禱內容',{exact:true}).fill('合成私密內容');await editor.getByLabel('公開範圍').selectOption('private');await fixture({writeFail:true});await editor.getByRole('button',{name:'儲存私密代禱',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor [role=status]').textContent.includes('合成儲存失敗'));const requestId=await page.evaluate(()=>t.calls.at(-1).input.requestId);ok(!!requestId&&await editor.getByLabel('公開範圍').inputValue()==='private','failed create preserves private choice and retry ID');
  await fixture({writeFail:false});await editor.getByRole('button',{name:'儲存私密代禱',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('私密代禱已儲存'));ok(await page.evaluate(id=>t.calls.at(-1).input.requestId===id&&t.calls.at(-1).input.is_private===true,requestId),'create retry retains ID and private visibility');
 }
 // A service permission denial clears previously displayed records.
 await fixture({allowed:false,readFail:false,writeFail:false,afterReadFail:false,delay:30});
 await page.locator(name==='newcomer-care'?'#refresh':'#reload').click();await settled();
 const dataContainer={'group-members':'#current','newcomer-care':'#cases','binding-review':'#requests','member-audit':'#audit-list','prayers':'#items'}[name];
 ok(await page.locator(dataContainer+' article').count()===0,'permission denial clears loaded records');
 await fixture({allowed:true});
 // Start a read, then revoke the session while it is pending. Late data may not reappear.
 await fixture({readFail:false,writeFail:false,afterReadFail:false,delay:100});
 await page.locator(name==='newcomer-care'?'#refresh':'#reload').click();
 await page.evaluate(()=>{t.allowed=false;fireAuth('SIGNED_OUT');});
 await page.waitForTimeout(180);
 const container={'group-members':'#current','newcomer-care':'#cases','binding-review':'#requests','member-audit':'#audit-list','prayers':'#items'}[name];
 ok(await page.locator(container+' article').count()===0,'sign-out clears records and ignores pending read');
 ok(!(await page.locator('main').textContent()).includes('合成私人關懷備註'),'sign-out clears private contents');
}
