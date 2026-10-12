// Computed text contrast. Composite translucent gradient layers over their real
// ancestor surface instead of assuming each decorative layer sits on white.
export function readableTextMetrics(){
 document.querySelectorAll('details').forEach(n=>n.open=true);
 const parse=c=>{const m=c?.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').map(Number):null;};
 const blend=(c,b)=>{const a=c[3]??1;return c.slice(0,3).map((v,i)=>v*a+b[i]*(1-a));};
 const lum=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 const layers=value=>{let depth=0,start=0,out=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){out.push(value.slice(start,i));start=i+1;}}out.push(value.slice(start));return out;};
 const cache=new WeakMap();
 const bg=node=>{if(!node)return[[255,255,255]];if(cache.has(node))return cache.get(node);const s=getComputedStyle(node),c=parse(s.backgroundColor)||[0,0,0,0];let colors=(c[3]??1)===1?[c.slice(0,3)]:bg(node.parentElement).map(b=>blend(c,b));
  for(const layer of layers(s.backgroundImage).reverse()){const stops=[...layer.matchAll(/rgba?\([^)]+\)/g)].map(m=>parse(m[0]));if(stops.length)colors=colors.flatMap(b=>stops.map(stop=>blend(stop,b)));}
  colors=[...new Map(colors.map(v=>[v.map(Math.round).join(','),v])).values()].slice(0,64);cache.set(node,colors);return colors;};
 const seen=new Set(),failures=[];let checked=0,text;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(text=walker.nextNode()){
  const n=text.parentElement,value=text.textContent.trim();if(!n||!value||n.closest('script,style,svg,[aria-hidden=true],button:disabled')||!n.getClientRects().length)continue;const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none')continue;
  const color=parse(s.color);if(!color)continue;const backgrounds=bg(n),ratio=Math.min(...backgrounds.map(b=>{const a=lum(blend(color,b)),l=lum(b);return(Math.max(a,l)+.05)/(Math.min(a,l)+.05);}));const size=parseFloat(s.fontSize),minimum=size>=24||size>=18.66&&Number(s.fontWeight)>=700?3:4.5;checked++;
  const selector=n.tagName.toLowerCase()+'.'+n.className,key=selector+s.color+backgrounds.toString();if(ratio+.01<minimum&&!seen.has(key)){seen.add(key);failures.push({selector,text:value.slice(0,70),color:s.color,backgrounds,ratio:Math.round(ratio*100)/100,minimum});}
 }
 const h=document.querySelector('.member-page>.page-header');return{checked,failures,header:h?.getBoundingClientRect().height,headerClipped:h?[...h.querySelectorAll('h1,.admin-identity,.header-tools')].some(n=>n.getBoundingClientRect().bottom>h.getBoundingClientRect().bottom):false,overflow:document.documentElement.scrollWidth>innerWidth+1};
}
