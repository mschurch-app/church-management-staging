const KEYS=Object.freeze(['accounts','journeys','signins_7d','beta','feedback']);
export function overviewProjection(value){
 if(value?.ok!==true||value.version!==1||typeof value.generated_at!=='string'||!Number.isFinite(Date.parse(value.generated_at))||!KEYS.every(key=>Number.isSafeInteger(value.stats?.[key])&&value.stats[key]>=0&&value.stats[key]<=value.stats.accounts))throw Error('管理摘要尚未完整取得，請重新查詢。');
 return {version:1,generated_at:value.generated_at,stats:Object.fromEntries(KEYS.map(key=>[key,value.stats[key]]))};
}
export const OVERVIEW_METRICS=Object.freeze([['accounts','已註冊帳號'],['journeys','有雲端旅程'],['signins_7d','近七天登入帳號'],['beta','公測參與帳號'],['feedback','已提交回饋帳號']]);
