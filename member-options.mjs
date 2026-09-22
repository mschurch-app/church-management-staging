export const FAITH_OPTIONS=["新朋友（初次聚會）", "慕道友（偶爾出現）", "受洗初信", "一般會友", "委身家人", "門徒", "領袖"];
export const MINISTRY_OPTIONS=[
  "敬拜主領", "敬拜歌者", "司琴鍵盤", "木吉他", "電吉他", "Bass手", 
  "爵士鼓手", "音控PA", "直播導播", "投影簡報", "主日招待", 
  "兒童主日學老師", "學青輔導", "總務愛筵", "關懷代禱",
  "網站管理", "社群媒體小編", "小組長", "美編設計",
  "司會報告", "主日禱告", "接送同工", "聖餐事奉"
];
export const DISTRICTS={"M+": ["大雅區", "西屯區", "北屯區", "南屯區", "西區", "北區", "東區", "南區", "沙鹿區", "其他"], "SHiNE": ["西屯區", "南屯區", "北屯區", "西區", "北區", "大雅區", "沙鹿區", "東區", "南區", "其他"]};
export const isInactive=value=>typeof value==='string'&&(value.includes('很久沒來')||value.includes('沒出現'));
export function ministryOptions(church,current=''){
 const excluded=['總務愛筵','司會報告','主日禱告','聖餐事奉'];
 return [...new Set([...MINISTRY_OPTIONS.filter(x=>church!=='SHiNE'||!excluded.includes(x)),...current.split(',').map(x=>x.trim()).filter(Boolean)])];
}
export function preserveChoice(values,current){
 return [...new Set([...values,...(current?[current]:[])])];
}
