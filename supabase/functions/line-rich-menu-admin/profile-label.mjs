import {stageMenu} from './stage.mjs';
export async function updateProfileLabel({config,api,download}){
 const oldId='richmenu-8b265837886d4bdc7ef88805d3869271',spec=config['refined-records'];
 const before=await api('richmenu/alias/'+spec.alias);
 const staged=await stageMenu({config:{candidate:{...spec,alias:'mplus-refined-20261121-records'}},key:'candidate',api,download});
 if(![oldId,staged.richMenuId].includes(before.richMenuId))throw Error('global_existing_alias_preserved');
 const changed=before.richMenuId!==staged.richMenuId;
 if(changed)await api('richmenu/alias/'+spec.alias,{method:'POST',body:{richMenuId:staged.richMenuId}});
 const after=await api('richmenu/alias/'+spec.alias);
 if(after.richMenuId!==staged.richMenuId)throw Error('global_alias_readback_failed');
 return{alias:spec.alias,before:before.richMenuId,richMenuId:after.richMenuId,alias_changed:changed,image_sha256:staged.image_sha256,default_changed:false,messages_sent:0};
}
