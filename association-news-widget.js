// Retired compatibility entry: the existing Wix iframe already renders association_news.
// Keep the old URL harmless while the disabled custom embed clears from Wix caches.
(()=>{const remove=()=>document.getElementById('tcsc-association-news')?.remove();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',remove,{once:true});else remove();})();
