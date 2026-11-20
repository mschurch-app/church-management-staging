const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
// Only the four already approved refined menus can become the default.
export async function setRefinedDefault({config,api,raw,download}){
 const list=await api('richmenu/list'),menus=[];
 for(const key of ['refined-closed','refined-walk','refined-life','refined-records']){
  const spec=config[key],matches=list.richmenus.filter(m=>m.name===spec.menu.name);
  if(matches.length!==1)throw Error('global_menu_not_ready');
  const {richMenuId,...definition}=matches[0];
  if(stable(definition)!==stable(spec.menu))throw Error('global_menu_mismatch');
  const alias=await api('richmenu/alias/'+spec.alias);
  if(alias.richMenuId!==richMenuId)throw Error('global_alias_mismatch');
  const image=await download(richMenuId);
  if(image.status!==200||image.sha256!==spec.image_sha256)throw Error('global_image_mismatch');
  menus.push({key,richMenuId,alias:spec.alias,image_sha256:image.sha256});
 }
 const target=menus[0].richMenuId,before=await raw('user/all/richmenu');
 if(![200,403,404].includes(before.status))throw Error('global_default_unavailable');
 if(before.status===200&&before.data.richMenuId!==target)throw Error('global_existing_default_preserved');
 if(before.status===403&&before.data.message!=='the richmenu is owned by another channel')throw Error('global_default_unavailable');
 const changed=before.status!==200;
 if(changed)await api('user/all/richmenu/'+target,{method:'POST'});
 const after=await raw('user/all/richmenu');
 if(after.status!==200||after.data.richMenuId!==target)throw Error('global_readback_failed');
 return {default_changed:changed,before_status:before.status,richMenuId:target,default_verified:true,menus,messages_sent:0,rollback:'Clear the Messaging API default to return to the unchanged Official Account Manager default.'};
}
