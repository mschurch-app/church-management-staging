/* Visual context only; never supplies authentication or permissions. */
(function(){
 const base=new URL('.',document.currentScript.src),params=new URLSearchParams(location.search);
 const explicit=params.get('church'),next=params.get('next')||'';
 if(explicit==='M+'&&location.pathname.endsWith('/pastoral/workspace.html')){location.replace(new URL('mplus-dashboard.html?church=M%2B',base));return;}
 function apply(selected){
  if(selected!=='M+')return;
  document.documentElement.classList.add('mplus-theme');
  document.documentElement.dataset.church='M+';
  for(const link of document.querySelectorAll('link[rel="stylesheet"]')){
   const file=new URL(link.href).pathname.split('/').pop();
   if(['theme-vitality.css','apple-ui.css','church-palette.css'].includes(file))link.media='not all';
  }
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#173f34';
 }
 window.applyMplusTheme=apply;
 if(explicit==='M+'||(!explicit&&(location.pathname.endsWith('/mplus-dashboard.html')||next.includes('mplus-dashboard.html')||next.includes('mplus-register.html'))))apply('M+');
})();
