// Server-authoritative garden rules. Browser requests never carry a saved state or XP.
export const ITEMS = [
  {id:'flower',first:1,cycle:3},{id:'lamp',first:3,cycle:5},
  {id:'bird',first:7,cycle:7},{id:'fountain',first:14,cycle:14},{id:'fruit',first:30,cycle:30},
];
const GEARS:Record<string,string>={truth:'belt',justice:'breastplate',peace:'boots',faith:'shield',hope:'helmet',word:'sword'};
const GEAR_DAYS:Record<string,number>={belt:3,breastplate:5,boots:7,shield:10,helmet:14,sword:21};
export function dayNow(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k)?.value).join('-');}
export function validDay(day:unknown):day is string{return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;}
const shift=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
function random(n:number){const a=new Uint32Array(1),bound=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=bound);return a[0]%n;}
function shuffled<T>(values:T[]){const a=[...values];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function festival(day:string,birthday=false){
  if(birthday)return {id:'birthday',items:['cake'],name:'生日快樂',music:'anniversary',day:1};
  const md=day.slice(5),year=day.slice(0,4);
  if(md==='12-31'||md==='01-01')return {id:'newyear',items:['fireworks'],name:'迎接新年',music:'newyear',day:1};
  if(md>='12-01'&&md<='12-31')return {id:'christmas',items:['reindeer'],name:'聖誕節',music:'christmas',day:1};
  if(md>='10-25'&&md<='10-31')return {id:'light',items:[],name:'光明勇士',music:'light',day:Number(md.slice(-2))-24};
  const nov=new Date(`${year}-11-01T12:00:00Z`),thanksgiving=1+(4-nov.getUTCDay()+7)%7+21;
  if(md>='11-01'&&md<='11-30'&&Number(md.slice(-2))>=thanksgiving-3&&Number(md.slice(-2))<=thanksgiving+3)return {id:'thanksgiving',items:['turkey'],name:'感恩節',music:'thanksgiving',day:Number(md.slice(-2))-thanksgiving+4};
  // Dates match the existing approved 2027 festival plan. No October test dates.
  const dates:Record<string,[string,string,string,string[],string]>={
    spring:['2027-02-01','2027-02-07','農曆春節',['redpacket'],'spring'],
    anniversary:['2027-03-01','2027-03-07','教會週年慶',[],'anniversary'],
    easter:['2027-03-21','2027-03-28','受難與復活',[],'passion'],
    pentecost:['2027-05-10','2027-05-16','聖靈降臨節',[],'pentecost'],
    dragon:['2027-06-07','2027-06-13','端午節',['dumpling'],'dragon'],
    moon:['2027-09-13','2027-09-19','中秋節',['mooncake'],'moon'],
    light:['2027-10-25','2027-10-31','光明勇士',[],'light'],
    thanksgiving:['2027-11-22','2027-11-28','感恩節',['turkey'],'thanksgiving'],
  };
  for(const [id,[start,end,name,items,music]] of Object.entries(dates))if(day>=start&&day<=end){const index=Math.round((Date.parse(day)-Date.parse(start))/864e5)+1;return {id,name,items:id==='easter'?index===1?['donkey']:index===5?['bread','chalice']:index===6?['cross']:index===8?['egg']:[]:items,music:id==='easter'&&index===8?'easter':music,day:index};}
  return {id:'garden',name:'與神同行',items:[],music:'',day:1};
}
export function emptyState(today:string){return {schema:3,startDate:today,records:[],notes:[],battles:[],encounters:{},equipped:[],placed:[],avatarId:null,life:{hp:100,mp:100},buffs:{reading:0,care:0},inventory:{},collection:{},receipts:[],legacyImported:false};}
export function refreshState(s:any,today:string,theme:any){
  const days=s.records.length;
  for(const item of ITEMS){const prior=s.inventory[item.id]||{count:0,earned:0,start:0};const needed=prior.earned?item.cycle:item.first;if(!prior.count&&days-prior.start>=needed){prior.count=1;prior.earned++;}s.inventory[item.id]=prior;}
  for(const id of theme.items){const key=`${today.slice(0,4)}:${id}`;if(s.records.some((r:any)=>r.reading_date===today)&&!s.collection[key]&&!s.inventory[id]?.count){s.inventory[id]={count:1,earned:(s.inventory[id]?.earned||0)+1,start:days};s.collection[key]=true;}}
  if(!s.encounters[today]){const boss=random(10)===0;s.encounters[today]={schema:2,boss,events:boss?[...shuffled(['truth','justice','peace']),...shuffled(['faith','hope','word'])]:shuffled(Object.keys(GEARS)),stage:0,stageHits:0};}
  return s;
}
export function applyCommand(s:any,action:string,p:any,today:string){
  const day=p.day||today;
  if(['read','water','journal'].includes(action)&&(!validDay(day)||day>today||day<s.startDate||day<shift(today,-7)))throw Error('date_not_allowed');
  if(action==='avatar'){if(!/^(male|female)-[123]$/.test(p.avatar||''))throw Error('invalid_action');s.avatarId=p.avatar;}
  else if(action==='equip'){if(!GEAR_DAYS[p.item])throw Error('invalid_action');s.equipped=s.equipped.includes(p.item)?s.equipped.filter((id:string)=>id!==p.item):[...s.equipped,p.item];}
  else if(action==='read'){
    if(!s.records.some((r:any)=>r.reading_date===day)){const boosted=s.buffs.reading>0;if(boosted)s.buffs.reading--;s.records.push({reading_date:day,completion_type:day===today?'on_time':'makeup',watered_at:null,boosted,completed_at:new Date().toISOString()});s.life.hp=Math.min(100,s.life.hp+40);s.life.mp=Math.min(100,s.life.mp+20);}
  }else if(action==='water'){
    const r=s.records.find((r:any)=>r.reading_date===day);if(!r)throw Error('read_first');if(!r.watered_at){r.watered_at=new Date().toISOString();s.life.mp=Math.min(100,s.life.mp+10);}
  }else if(action==='journal'){
    if(!s.records.some((r:any)=>r.reading_date===day))throw Error('read_first');if(typeof p.note!=='string'||!p.note.trim()||p.note.length>500)throw Error('invalid_note');const prior=s.notes.find((r:any)=>r.reading_date===day);if(prior)prior.note=p.note.trim();else {s.notes.push({reading_date:day,note:p.note.trim()});s.life.mp=Math.min(100,s.life.mp+10);}
  }else if(action==='place'){
    const inv=s.inventory[p.item];if(!inv?.count)throw Error('item_unavailable');
    if(p.item==='flower'&&s.life.hp>=100||p.item==='lamp'&&s.life.mp>=100)throw Error('already_full');
    inv.count=0;inv.start=s.records.length;
    s.placed.push({id:p.item,at:new Date().toISOString(),x:20+random(65),y:50+random(30)});
    if(p.item==='flower')s.life.hp=Math.min(100,s.life.hp+20);
    else if(p.item==='lamp')s.life.mp=Math.min(100,s.life.mp+20);
    else if(p.item==='bird')s.buffs.reading++;
    else if(p.item==='fruit')s.buffs.reading+=3;
    else if(p.item==='fountain')s.buffs.care++;
    else s.life.mp=Math.min(100,s.life.mp+10);
  }else if(action==='move'){
    const i=Number(p.index);if(!Number.isInteger(i)||!s.placed[i]||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('invalid_action');s.placed[i].x=Math.max(8,Math.min(92,p.x));s.placed[i].y=Math.max(30,Math.min(85,p.y));
  }else if(action==='hit'){
    const e=s.encounters[today];if(p.day!==today||p.stage!==e.stage||p.hits!==e.stageHits||e.stage>=6)throw Error('stale_event');
    const gear=GEARS[e.events[e.stage]];if(p.gear!==gear||gear==='belt'&&p.choice!==0)throw Error('wrong_gear');
    const boss=e.boss&&e.stage>=3,cost=boss?5:2;if(s.life.hp<=0)throw Error('rest_needed');if(s.life.mp<cost)throw Error('mp_needed');
    s.life.mp-=cost;s.life.hp=Math.max(0,s.life.hp-(boss?2+random(5):1+random(3)));e.stageHits++;
    if(e.stageHits>=(gear==='belt'?1:3)){e.stage++;e.stageHits=0;if(e.stage===6)s.battles.push({reading_date:today,kind:e.boss?'boss':'normal'});}
  }else if(action!=='me')throw Error('invalid_action');
  return s;
}
