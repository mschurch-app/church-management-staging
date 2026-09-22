export const FAITH_OPTIONS=["新朋友（初次聚會）", "慕道友（偶爾出現）", "受洗初信", "一般會友", "委身家人", "門徒", "領袖"];
export const MINISTRY_OPTIONS=[
  "敬拜主領", "敬拜歌者", "司琴鍵盤", "木吉他", "電吉他", "Bass手", 
  "爵士鼓手", "音控PA", "直播導播", "投影簡報", "攝影", "主日招待",
  "兒童主日學老師", "學青輔導", "總務愛筵", "關懷代禱",
  "網站管理", "社群媒體小編", "小組長", "美編設計",
  "司會報告", "主日禱告", "接送同工", "聖餐事奉"
];
export const DISTRICTS={"M+": ["大雅區", "西屯區", "北屯區", "南屯區", "西區", "北區", "東區", "南區", "沙鹿區", "其他"], "SHiNE": ["西屯區", "南屯區", "北屯區", "西區", "北區", "大雅區", "沙鹿區", "東區", "南區", "其他"]};
export const isInactive=value=>typeof value==='string'&&(value.includes('很久沒來')||value.includes('沒出現'));
export function ministryOptions(church,current=''){
 return [...new Set([...MINISTRY_OPTIONS,...current.split(',').map(x=>x.trim()).filter(Boolean)])];
}
export async function loadMinistryOptions(db,current=''){const {data,error}=await db.from('member_ministry_options').select('options').eq('id',true).maybeSingle();const configured=!error&&Array.isArray(data?.options)?data.options:MINISTRY_OPTIONS;return [...new Set([...configured.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()),...current.split(',').map(x=>x.trim()).filter(Boolean)])];}
export async function saveMinistryOptions(db,options){const clean=[...new Set(options.map(x=>String(x).trim()).filter(Boolean))];if(!clean.length||clean.length>100||clean.some(x=>x.length>80))throw new Error('恩賜選項格式不正確。');const {data:{user}}=await db.auth.getUser();if(!user)throw new Error('登入已失效。');const {data,error}=await db.from('member_ministry_options').update({options:clean,updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',true).select('options');if(error||!Array.isArray(data)||data.length!==1)throw new Error('恩賜選項未儲存。');return data[0].options;}
export function preserveChoice(values,current){
 return [...new Set([...values,...(current?[current]:[])])];
}
