import {createAppIcon} from './app-icons.mjs?v=20261020-shell2';
export const FUNCTION_CENTERS=[['church','教會','home'],['school','課輔','mplus-book'],['admin','行政','mplus-box'],['service','服事','mplus-calendar'],['website','網站','mplus-globe']];
const base=new URL('.',import.meta.url);
export function centerForPage(path=location.pathname){
 if(/schedules|service-signup/.test(path))return 'service';
 if(/website|bulletin|association-news|publishing|pastoral-content|todays-message|love-share|youtube|subtitle/.test(path))return 'website';
 if(/inventory|spaces|amenities|heat-camp|coworker-tools/.test(path))return 'admin';
 return 'church';
}
export function mountMplusFunctionNavigation({church,center}={}){
 if(church!=='M+'||document.documentElement.dataset.appShell==='mplus')return;
 center ||= centerForPage();
 document.documentElement.dataset.mplusFunctionNav='true';
 if(!document.querySelector('link[data-mplus-function-nav]')){const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('mplus-function-nav.css?v=20261020-dock1',base);sheet.dataset.mplusFunctionNav='';document.head.append(sheet);}
 let dock=document.querySelector('.mplus-function-dock');
 if(!dock){dock=document.createElement('nav');document.body.append(dock);}
 dock.className='mplus-function-dock';dock.setAttribute('aria-label','M+ 五大入口');dock.replaceChildren();
 for(const [key,label,icon]of FUNCTION_CENTERS){const link=document.createElement('a'),url=new URL('mplus-dashboard.html',base);url.searchParams.set('church','M+');url.searchParams.set('center',key);link.href=url;link.dataset.center=key;if(key===center)link.setAttribute('aria-current','page');link.append(createAppIcon(icon,'mplus-function-icon'),document.createTextNode(label));dock.append(link);}
 return dock;
}
