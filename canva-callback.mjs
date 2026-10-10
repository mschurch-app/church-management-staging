const query=new URLSearchParams(location.search),result=query.get('result'),church=query.get('church');
document.getElementById('result').textContent=result==='connected'?'Canva 已連結，可以回週報設定模板。':result==='cancelled'?'已取消 Canva 授權。':'Canva 授權未完成，請回原本頁面重新連結。';
const back=document.getElementById('back');
if(['M+','SHiNE'].includes(church))back.href='website-maintenance.html?church='+encodeURIComponent(church);
else back.hidden=true;
if(window.opener){window.opener.postMessage({type:'church-canva-connected',result},location.origin);window.close();}
history.replaceState(null,'',location.pathname);
