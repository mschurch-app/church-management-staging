const ROLE_KEYS={
  '敬拜':'worship_leader','敬拜讚美':'worship_leader','敬拜帶領':'worship_leader','敬拜主領':'worship_leader',
  '禱告':'prayer','公禱':'prayer','主日公禱':'prayer',
  '信息':'speaker','講道':'speaker','信息分享':'speaker','講員':'speaker','證道':'speaker',
  '司會':'presider','主持':'presider'
};
const normalize=value=>String(value||'').normalize('NFKC').replace(/[\s：:、，,。·・／/（）()]/gu,'').trim();
export function programAssignment(label,data){
  const schedule=data?.schedule;if(!schedule||typeof schedule!=='object')return null;
  const assignments=schedule;
  const nameFor=key=>typeof assignments[key]==='string'?assignments[key].trim():'';
  const title=normalize(label);if(!title)return null;
  const roles=Array.isArray(data.schedule_roles)?data.schedule_roles:[];
  const matches=roles.filter(role=>normalize(role.label)===title&&nameFor(role.role_key));
  if(matches.length){
    const names=new Set(matches.map(role=>nameFor(role.role_key)));
    return names.size===1?{name:[...names][0],roleKey:matches[0].role_key}:null;
  }
  const roleKey=ROLE_KEYS[title],name=roleKey?nameFor(roleKey):'';
  return name?{name,roleKey}:null;
}
