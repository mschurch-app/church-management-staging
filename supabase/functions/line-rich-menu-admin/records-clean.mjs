import {stageMenu} from './stage.mjs';
export async function removeDuplicateTestimony({config,api,download}){
 const oldIds=['richmenu-2ef361f729c5d015f5df4e6bab28b08f','richmenu-8b265837886d4bdc7ef88805d3869271'],spec=config['refined-records'];
 const before=await api('richmenu/alias/'+spec.alias);
 const staged=await stageMenu({config:{candidate:{...spec,alias:'mplus-records-clean-20261121'}},key:'candidate',api,download});
 if(![...oldIds,staged.richMenuId].includes(before.richMenuId))throw Error('global_existing_alias_preserved');
 const batch={operations:oldIds.map(from=>({type:'link',from,to:staged.richMenuId})),resumeRequestKey:'mplus-records-clean-20261121-1'};
 await api('richmenu/validate/batch',{method:'POST',body:batch});
 if(before.richMenuId!==staged.richMenuId)await api('richmenu/alias/'+spec.alias,{method:'POST',body:{richMenuId:staged.richMenuId}});
 const after=await api('richmenu/alias/'+spec.alias);
 if(after.richMenuId!==staged.richMenuId)throw Error('global_alias_readback_failed');
 const migration=await api('richmenu/batch',{method:'POST',body:batch});
 return{alias:spec.alias,before:before.richMenuId,richMenuId:after.richMenuId,image_sha256:staged.image_sha256,items:spec.menu.areas.map(a=>a.action.label).filter(Boolean),batch_request_id:migration.request_id,default_changed:false,messages_sent:0};
}
