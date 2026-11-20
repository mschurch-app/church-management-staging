export function validateShineConfig(config){
 const aliases=new Set(Object.values(config).map(s=>s.alias));
 for(const [key,s]of Object.entries(config))for(const a of s.menu.areas){
  const b=a.bounds;if(b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>2500||b.y+b.height>s.menu.size.height)throw Error('unsafe_bounds');
  if(a.action.type==='richmenuswitch'){if(!aliases.has(a.action.richMenuAliasId))throw Error('unsafe_alias');continue;}
  if(a.action.type!=='uri')throw Error('unsafe_action');
  const u=new URL(a.action.uri);if(u.origin!=='https://liff.line.me'||u.searchParams.get('church')!=='SHiNE')throw Error('unsafe_church');
  if(u.pathname==='/2011645391-df7KVuPS'){if(!['daily_reading','help','weekly','love','newcomer'].includes(u.searchParams.get('feature')))throw Error('unsafe_feature');}
  else if(u.pathname!=='/2011645391-0tHoZ8pb')throw Error('unsafe_liff');
 }
 return true;
}
