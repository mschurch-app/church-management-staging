const CACHE='church-os-shell-20261010-match-board1';
const OFFLINE='/app-offline.html';
const SHELL=[OFFLINE,'/app-offline.mjs?v=20261009-stage4','/app-runtime.mjs?v=20261009-stage4','/app.webmanifest','/assets/app/church-os-icon.svg','/assets/app/church-os-icon-192.png','/assets/app/church-os-icon-512.png','/auth.css','/apple-ui.css','/church-brand.css','/theme-vitality.css','/church-palette.css','/app-consistency.css?v=20261009-stage4','/app-design-tokens.css?v=20261009-stage2','/vendor/supabase-2.102.0.js','/app-line-auth.mjs','/admin-auth-config.mjs','/app-function-definitions.mjs?v=20261010-season-test1','/app-icons.mjs','/app-ui.mjs','/app-workflow.mjs?v=20261009-stage4','/app-workflow.css?v=20261009-stage3','/website-workflow.css?v=20261009-stage3'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('message',event=>{if(event.data?.type==='CHURCH_ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('church-os-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function offlinePage(){return await caches.match(OFFLINE)||new Response('目前暫時無法連線，請重新整理後再試。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
async function remember(request,response){if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  // HTML, OAuth callbacks and handoff URLs are never stored as navigations.
  event.respondWith(fetch(new Request(request,{cache:'no-store'})).then(response=>response.status>=500?offlinePage():response).catch(offlinePage));return;
 }
 if(['style','script','manifest'].includes(request.destination)){
  event.respondWith(fetch(new Request(request,{cache:'no-cache'})).then(response=>{if(response.status>=500)return caches.match(request).then(cached=>cached||response);event.waitUntil(remember(request,response.clone()).catch(()=>{}));return response;}).catch(async()=>await caches.match(request)||Response.error()));return;
 }
 if(request.destination==='image'&&url.pathname.startsWith('/assets/')){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{event.waitUntil(remember(request,response.clone()).catch(()=>{}));return response;})));return;
 }
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();let target='/admin-dashboard.html';try{const url=new URL(event.notification.data?.url||target,self.location.origin);if(url.origin===self.location.origin)target=url.href;}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const open=windows.find(client=>'focus'in client);if(open){try{await open.navigate(target);return await open.focus();}catch{}}return self.clients.openWindow(target);}));
});
self.addEventListener('push',event=>{let payload={};try{payload=event.data?.json()||{};}catch{payload={body:event.data?.text()||''};}event.waitUntil(self.registration.showNotification(payload.title||'教會 OS',{body:payload.body||'你有一則新通知。',icon:'/assets/app/church-os-icon-192.png',badge:'/assets/app/church-os-icon-192.png',tag:payload.tag||'church-os',data:{url:payload.url||'/admin-dashboard.html'}}));});
