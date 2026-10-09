import {FUNCTION_CATALOG,functionHref} from './app-function-definitions.mjs?v=20261009-stage2';
import {createAppIcon} from './app-icons.mjs?v=20261009-stage2';

export function element(tag,text='',className=''){const node=document.createElement(tag);node.textContent=text;node.className=className;return node;}

// Navigation and editing controls are siblings: no button is nested in a link.
export function createFunctionEntry(key,{church,variant='folder',control}={}){
  const item=FUNCTION_CATALOG[key];if(!item)throw new Error('unknown_function');
  const card=element('div','',variant==='favorite'?'app-hub-card':'dashboard-card');
  card.dataset.iosIcon=key;card.dataset.functionKey=key;
  const link=element('a','','function-open');link.href=functionHref(key,church);link.setAttribute('aria-label',item.title);
  link.append(createAppIcon(key,'dashboard-icon function-icon'),element(variant==='favorite'?'strong':'h3',item.title),element(variant==='favorite'?'small':'p',item.description));card.append(link);
  if(control){const button=element('button',control.text,'secondary app-icon-control '+control.className);button.type='button';button.dataset.actionFeedback='off';button.setAttribute('aria-label',control.label);if(control.key)button.dataset.addQuick=control.key;card.append(button);}
  return card;
}

export function createSettingsEntry(key,church){
  const item=FUNCTION_CATALOG[key],link=element('a','','settings-link-card');
  link.id=item.settingsId;link.dataset.iosIcon=key;link.dataset.functionKey=key;link.href=functionHref(key,church);
  const copy=element('span','','settings-link-copy'),arrow=element('span','›','settings-link-arrow');arrow.setAttribute('aria-hidden','true');copy.append(element('strong',item.title),element('span',item.description));
  link.append(createAppIcon(key,'settings-link-icon function-icon'),copy,arrow);return link;
}

export function setStatus(node,message,{tone='neutral',busy=false}={}){node.textContent=message;node.dataset.tone=tone;node.setAttribute('aria-busy',String(busy));node.hidden=!message;}
