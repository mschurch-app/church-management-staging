const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export async function stageMenu({config,key,api,download}){
 const spec=config[key];if(!spec)throw Error('invalid_key');
 await api('richmenu/validate',{method:'POST',body:spec.menu});
 const list=await api('richmenu/list');const matches=list.richmenus.filter(m=>m.name===spec.menu.name);if(matches.length>1)throw Error('duplicate_menu');
 let menu=matches[0];if(menu){const comparable=({richMenuId,...rest})=>rest;if(stable(comparable(menu))!==stable(spec.menu))throw Error('existing_menu_mismatch')}else{const result=await api('richmenu',{method:'POST',body:spec.menu});menu={...spec.menu,richMenuId:result.richMenuId}}
 const image=await download(menu.richMenuId);if(image.status===404){const expected=await download(null,spec.image_url);if(expected.status!==200||expected.sha256!==spec.image_sha256||expected.bytes.byteLength>=1000000)throw Error('image_integrity_failed');await api('richmenu/'+menu.richMenuId+'/content',{method:'POST',bytes:expected.bytes,dataDomain:true});}else if(image.status!==200||image.sha256!==spec.image_sha256)throw Error('existing_image_mismatch');
 const finalImage=await download(menu.richMenuId);if(finalImage.status!==200||finalImage.sha256!==spec.image_sha256)throw Error('image_readback_failed');
 const aliases=await api('richmenu/alias/list');const alias=aliases.aliases.find(a=>a.richMenuAliasId===spec.alias);if(alias&&alias.richMenuId!==menu.richMenuId)throw Error('alias_conflict');if(!alias)await api('richmenu/alias',{method:'POST',body:{richMenuAliasId:spec.alias,richMenuId:menu.richMenuId}});
 const readback=await api('richmenu/'+menu.richMenuId);if(readback.name!==spec.menu.name||stable(readback.areas)!==stable(spec.menu.areas))throw Error('menu_readback_failed');
 return {key,richMenuId:menu.richMenuId,alias:spec.alias,image_sha256:finalImage.sha256,assigned:false,default_changed:false};
}
