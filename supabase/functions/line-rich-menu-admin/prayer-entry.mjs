import {stageMenu} from './stage.mjs';
export async function updatePrayerEntry({config,api,download}){
 const oldId='richmenu-ab3526c6f2846b95e6abe865f64d3e33',spec=config['refined-walk'];
 const before=await api('richmenu/alias/'+spec.alias);
 const staged=await stageMenu({config:{candidate:{...spec,alias:'mplus-refined-20261121-walk'}},key:'candidate',api,download});
 if(![oldId,staged.richMenuId].includes(before.richMenuId))throw Error('global_existing_alias_preserved');
 const batch={operations:[{type:'link',from:oldId,to:staged.richMenuId}],resumeRequestKey:'mplus-prayer-direct-20261121-1'};
 await api('richmenu/validate/batch',{method:'POST',body:batch});
 if(before.richMenuId!==staged.richMenuId)await api('richmenu/alias/'+spec.alias,{method:'POST',body:{richMenuId:staged.richMenuId}});
 const after=await api('richmenu/alias/'+spec.alias);
 if(after.richMenuId!==staged.richMenuId)throw Error('global_alias_readback_failed');
 const migration=await api('richmenu/batch',{method:'POST',body:batch});
 return{alias:spec.alias,before:before.richMenuId,richMenuId:after.richMenuId,image_sha256:staged.image_sha256,prayer_uri:spec.menu.areas.find(a=>a.action.label==='請為我禱告').action.uri,batch_request_id:migration.request_id,default_changed:false,messages_sent:0};
}
