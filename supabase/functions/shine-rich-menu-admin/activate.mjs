const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export async function activateShine({config,api,raw,download}){
 const list=await api('richmenu/list'),verified=[];
 for(const [key,s]of Object.entries(config)){
  const found=list.richmenus.filter(m=>m.name===s.menu.name);if(found.length!==1)throw Error('menus_not_ready');
  const {richMenuId,...definition}=found[0];if(stable(definition)!==stable(s.menu))throw Error('menu_mismatch');
  if((await api('richmenu/alias/'+s.alias)).richMenuId!==richMenuId)throw Error('alias_mismatch');
  const image=await download(richMenuId);if(image.status!==200||image.sha256!==s.image_sha256)throw Error('image_mismatch');
  verified.push({key,richMenuId,alias:s.alias,image_sha256:image.sha256});
 }
 const target=verified.find(m=>m.key==='closed').richMenuId,before=await raw('user/all/richmenu');
 if(![200,403,404].includes(before.status))throw Error('default_unavailable');
 if(before.status===200&&!verified.some(m=>m.richMenuId===before.data.richMenuId))throw Error('existing_default_preserved');
 const changed=before.status!==200||before.data.richMenuId!==target;
 if(changed)await api('user/all/richmenu/'+target,{method:'POST'});
 const after=await raw('user/all/richmenu');if(after.status!==200||after.data.richMenuId!==target)throw Error('default_readback_failed');
 return {church:'SHiNE',default_changed:changed,before_status:before.status,richMenuId:target,verified,messages_sent:0};
}
