import {lineConfig} from './line-config.mjs';
const church=lineConfig(location.search).church;
if(church==='M+'){
 document.title='請為我禱告｜M+ 大雅教會';
 for(const href of ['line-member.css?v=20261120-sharedmenu1','member-prayer-form.css?v=20261119-membercare1']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
 document.body.className='';
 document.body.innerHTML="<main class=\"line-app\"><header class=\"app-head\"><a href=\"line-member.html?church=M%2B&feature=menu\" aria-label=\"回會友服務首頁\">⌂ 首頁</a><div class=\"identity\"><strong>M+ 大雅教會 · 請為我禱告</strong></div></header><div class=\"content\"><p id=\"status\" role=\"status\">正在確認 LINE 身分…</p><div id=\"request-form\"></div><button id=\"reload\" type=\"button\" class=\"secondary\">重新查詢代禱紀錄</button><div id=\"request-list\"></div></div></main>";
 await import('./member-prayer-page.mjs?v=20261121-canonical1');
}else{await import('./prayer-wall.mjs?v=20261119-flowtrace1');}
