export function contrastMetrics(){
  document.querySelectorAll('details').forEach(n=>n.open=true);
  const parse=c=>{const m=c?.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').map(Number):null;};
  const blend=(c,b)=>{const a=c[3]??1;return c.slice(0,3).map((v,i)=>v*a+b[i]*(1-a));};
  const lum=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const bg=node=>{for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n),colors=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>parse(m[0]));const c=parse(s.backgroundColor);if(colors.length){const base=c&&c[3]!==0?blend(c,[255,255,255]):[255,255,255];return colors.map(v=>blend(v,base));}if(c&&(c[3]??1)>.1)return[blend(c,[255,255,255])];}return[[255,255,255]];};
  let checked=0;const failures=[];const seen=new Set();const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let text;
  while(text=walker.nextNode()){
   const value=text.textContent.trim(),n=text.parentElement;if(!value||!n||n.closest('script,style,svg,[aria-hidden=true],button:disabled')||!n.getClientRects().length)continue;
   const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none')continue;
   const color=parse(s.color);if(!color)continue;const backgrounds=bg(n),ratio=Math.min(...backgrounds.map(background=>{const a=lum(blend(color,background)),b=lum(background);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
   const size=parseFloat(s.fontSize),minimum=size>=24||size>=18.66&&Number(s.fontWeight)>=700?3:4.5;checked++;
   const selector=n.tagName.toLowerCase()+'.'+n.className,key=selector+s.color+backgrounds.toString();if(ratio+.01<minimum&&!seen.has(key)){seen.add(key);failures.push({selector,text:value.slice(0,45),color:s.color,backgrounds,ratio:Math.round(ratio*100)/100,minimum});}
  }
  const h=document.querySelector('.member-page>.page-header');return{checked,failures,header:h?.getBoundingClientRect().height,headerClipped:h?[...h.querySelectorAll('h1,.admin-identity,.header-tools')].some(n=>n.getBoundingClientRect().bottom>h.getBoundingClientRect().bottom):false};
 }
