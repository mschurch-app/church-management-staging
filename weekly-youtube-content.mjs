// Shared by the weekly editor, review preview and YouTube publisher.
const compact=(s,max=5000)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,max);
function error(code){throw new Error(code);}
export function weeklyMetadata(row){
 const date=String(row.service_date).slice(0,10),topic=compact(row.sermon_topic,100),scripture=compact(row.sermon_scripture,500),speaker=compact(row.sermon_speaker,100);
 if(!topic||!scripture||!speaker)error('sermon_information_required');
 const title=compact(`${topic}｜${speaker}｜M+大雅教會主日直播｜${date.replaceAll('-','/')}`,100);
 const book=scripture.replace(/[\d０-９一二三四五六七八九十百]+(?:篇|章|節)?.*$/u,'').trim();
 const tags=[...new Set(['M+大雅教會','大雅教會','台中教會','主日崇拜','主日直播','基督教','聖經信息',topic,speaker,book].filter(Boolean))];
 const description=[`歡迎一起參與 M+大雅教會主日崇拜，一同聆聽神的話語。`,'',`本週主題｜${topic}`,`信息經文｜${scripture}`,`講員｜${speaker}`,`主日日期｜${date}`,`聚會時間｜${compact(row.service_time,200)}`,...(row.subtitle?['',compact(row.subtitle,1000)]:[]),'',`線上週報｜https://daya.mchurch.online/weekly`,'教會網站｜https://daya.mchurch.online','',`#Mplus大雅教會 #主日崇拜${book?' #'+book.replace(/\s/g,''):''}`].filter(x=>x!==null).join('\n');
 const result={title:row.youtube_title?compact(row.youtube_title,100):title,description:row.youtube_description?compact(row.youtube_description):compact(description),tags:Array.isArray(row.youtube_tags)&&row.youtube_tags.length?[...new Set(row.youtube_tags.map(x=>compact(x,100)).filter(Boolean))]:tags};
 if(result.tags.length>30||result.tags.join(',').length>450)error('tags_too_long');
 return result;
}
