// Read-only rendering of the authenticated review snapshot; never fetches a published substitute.
export function bulletinReader(row,{imageUrl=()=>''}={}){
 const make=(tag,value='',cls='')=>Object.assign(document.createElement(tag),{textContent:value||'',className:cls});
 const paper=make('article','','bulletin-reader');paper.setAttribute('aria-label','送審週報完整預覽');
 const header=make('header','','bulletin-reader-header');header.append(make('p',row.church_id==='SHiNE'?'SH i NE 教會':'M+ 大雅教會','bulletin-reader-brand'),make('h2',row.title||'本週週報'),make('p',[row.service_date,row.service_time].filter(Boolean).join('　')));if(row.subtitle)header.append(make('p',row.subtitle));paper.append(header);
 if(row.hero_image_path){const src=imageUrl(row.hero_image_path);if(src){const img=make('img');img.src=src;img.alt='主日週報主視覺';img.className='bulletin-reader-hero';paper.append(img);}}
 const sermon=make('section','','bulletin-reader-section');sermon.append(make('h3','主日信息'),make('h4',row.sermon_topic||''),make('p',[row.sermon_scripture,row.sermon_speaker].filter(Boolean).join('｜')));paper.append(sermon);
 const schedule=(which,title)=>{const rows=row.weekly_schedule?.[which]||[];if(!rows.length)return;const section=make('section','','bulletin-reader-section');section.append(make('h3',title));const list=make('dl');for(const item of rows){list.append(make('dt',item.label),make('dd',item.value));}section.append(list);paper.append(section);};
 let schedules=false;
 for(const section of row.sections||[]){if(section.enabled===false)continue;if(section.auto_schedule){if(!schedules){schedule('current','本週服事');schedule('next','下週服事');schedules=true;}continue;}
 const block=make('section','','bulletin-reader-section');block.append(make('h3',section.title||'週報內容'));if(section.description)block.append(make('p',section.description));for(const item of section.items||[]){if(!item.label&&!item.body)continue;const entry=make('div','','bulletin-reader-entry');if(item.label)entry.append(make('h4',item.label));if(item.body)entry.append(make('p',item.body));block.append(entry);}paper.append(block);}
 if(!schedules){schedule('current','本週服事');schedule('next','下週服事');}
 return paper;
}
