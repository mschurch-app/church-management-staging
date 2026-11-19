import {MESSAGE_CATEGORIES,MESSAGE_TEMPLATES,templateMessage} from './member-line-templates.mjs?v=20261119-templates1';
const el=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
// Shared by single-recipient and campaign composers. name=null preserves {name} for per-recipient rendering.
export function createMessageTemplatePicker({name=null,onApply}){
 const root=el('section','','member-line-template-picker'),category=el('select'),sub=el('select'),cards=el('div','','member-line-template-cards'),sample=el('pre','','member-line-template-sample'),apply=el('button','套用這則文案','secondary'),status=el('p','先選用途，再點選文案閱讀全文；套用後仍可修改。','muted');
 category.setAttribute('aria-label','情境範本');sub.setAttribute('aria-label','活動節慶次分類');category.append(new Option('自行撰寫','blank'));for(const c of MESSAGE_CATEGORIES)category.append(new Option(c.title,c.key));
 const label=el('label','選擇訊息用途'),subLabel=el('label','活動節慶');label.append(category);subLabel.append(sub);root.append(el('h3','挑選罐頭文案'),status,label,subLabel,cards,sample,apply);apply.type='button';sample.setAttribute('aria-label','範本文案全文');
 let selected=null,disabled=false;const buttons=[];
 function choose(t){selected=t;sample.textContent=templateMessage(t.key,name);sample.hidden=false;apply.hidden=false;for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.key===t.key));}
 function render(){selected=null;cards.replaceChildren();buttons.length=0;sample.hidden=apply.hidden=true;subLabel.hidden=category.value!=='activity';const rows=MESSAGE_TEMPLATES.filter(t=>t.category===category.value&&t.key!=='blank'&&(!sub.value||t.subcategory===sub.value));for(const t of rows){const b=el('button','','secondary');b.type='button';b.dataset.key=t.key;b.setAttribute('aria-pressed','false');b.disabled=disabled;b.append(el('strong',t.title),el('span',templateMessage(t.key,name).replaceAll('\n',' ').slice(0,64)+'…'));b.onclick=()=>choose(t);cards.append(b);buttons.push(b);}status.textContent=category.value==='blank'?'直接在下方撰寫，或先選一個用途找靈感。':`這一類有 ${rows.length} 種選擇。點選可閱讀全文，套用後仍可修改。`;}
 category.onchange=()=>{sub.replaceChildren(new Option('全部活動與節慶',''));if(category.value==='activity')for(const title of [...new Set(MESSAGE_TEMPLATES.filter(t=>t.category==='activity').map(t=>t.subcategory))])sub.append(new Option(title,title));render();};sub.onchange=render;
 apply.onclick=()=>{if(!disabled&&selected)onApply(templateMessage(selected.key,name),selected);};render();
 return {element:root,setDisabled(value){disabled=!!value;category.disabled=sub.disabled=apply.disabled=disabled;for(const b of buttons)b.disabled=disabled;}};
}
