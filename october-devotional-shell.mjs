// Render the existing devotional page at the original LIFF endpoint. LINE only
// guarantees initialization at that endpoint or beneath its URL path.
export async function openOctoberDevotional(){
  try{
    const response=await fetch('daily-devotional.html',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('devotional_shell_unavailable');
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const main=doc.querySelector('main.devotional-app'),source=doc.querySelector('link[href^="daily-devotional.css"]');
    if(!main||!source)throw Error('devotional_shell_incomplete');
    const style=document.createElement('link');style.rel='stylesheet';style.href=source.getAttribute('href');document.head.append(style);
    // The module provides genuine loading/error states while the sheet loads.
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link=>{if(link!==style)link.remove();});
    document.title=doc.title;document.body.className='';document.body.replaceChildren(main);
    await import('./daily-devotional.mjs?v=20261010-journal-contract1');
  }catch{
    const main=document.createElement('main'),p=document.createElement('p'),retry=document.createElement('button'),back=document.createElement('a');
    p.textContent='靈修暫時無法載入，請重試。讀經與澆水紀錄仍保留。';retry.textContent='重新載入';retry.type='button';retry.onclick=()=>location.reload();back.textContent='回生命樹';back.href='tree-reading-october-test.html';main.append(p,retry,back);document.body.replaceChildren(main);
  }
}
