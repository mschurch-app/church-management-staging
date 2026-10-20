/* This standalone shell owns visual/device setup before any shared data imports.
   Claim the existing idempotency marker so cached legacy runtimes cannot inject
   their skin or rebuild the old navigation. Auth/session checks remain untouched. */
(function(){
 const root=document.documentElement;
 if(root.dataset.appShell!=='mplus'||window.__mplusShellRuntime)return;
 window.__mplusShellRuntime=true;
 window.__churchIosExperience=true;
 if(window.visualViewport){const resize=()=>{const inset=Math.max(0,innerHeight-window.visualViewport.height-window.visualViewport.offsetTop);root.style.setProperty('--ios-keyboard-inset',`${inset}px`);root.classList.toggle('ios-keyboard-open',inset>100);};window.visualViewport.addEventListener('resize',resize);window.visualViewport.addEventListener('scroll',resize);resize();}
})();
