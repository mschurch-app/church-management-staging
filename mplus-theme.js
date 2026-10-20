/* Visual context only; never supplies authentication or permissions. */
(function(){
 const base=new URL('.',document.currentScript.src),params=new URLSearchParams(location.search);
 const explicit=params.get('church'),next=params.get('next')||'';
 if(explicit==='M+'&&location.pathname.endsWith('/pastoral/workspace.html')){location.replace(new URL('mplus-dashboard.html?church=M%2B',base));return;}
 if(explicit==='M+'&&location.pathname.endsWith('/pastoral/coworker-tools.html')){const target=new URL('pastoral/mplus-coworker-tools.html',base);target.search=location.search;target.hash=location.hash;location.replace(target);return;}
 if(explicit==='M+'&&location.pathname.endsWith('/admin-dashboard.html')){location.replace(new URL('mplus-dashboard.html?church=M%2B',base));return;}
 let skinObserver;
 function disableLegacySkin(link){if(link?.matches?.('link[rel="stylesheet"]')&&['theme-vitality.css','apple-ui.css','church-palette.css'].includes(new URL(link.href).pathname.split('/').pop()))link.media='not all';}
 function apply(selected){
  if(selected!=='M+')return;
  document.documentElement.classList.add('mplus-theme');
  document.documentElement.dataset.church='M+';
  for(const link of document.querySelectorAll('link[rel="stylesheet"]')){
   const file=new URL(link.href).pathname.split('/').pop();
   if(['theme-vitality.css','apple-ui.css','church-palette.css'].includes(file))link.media='not all';
  }
  if(!skinObserver&&typeof MutationObserver!=='undefined'){skinObserver=new MutationObserver(records=>{if(document.documentElement.dataset.church!=='M+')return;for(const record of records)for(const node of record.addedNodes){disableLegacySkin(node);node.querySelectorAll?.('link[rel="stylesheet"]').forEach(disableLegacySkin);}});skinObserver.observe(document.head,{childList:true,subtree:true});}
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#173f34';
 }
 window.applyMplusTheme=apply;
 if(explicit==='M+'||(!explicit&&(location.pathname.endsWith('/mplus-dashboard.html')||location.pathname.endsWith('/pastoral/mplus-coworker-tools.html')||next.includes('mplus-dashboard.html')||next.includes('mplus-register.html'))))apply('M+');
})();
