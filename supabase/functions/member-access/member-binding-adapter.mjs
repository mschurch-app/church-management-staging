export function makeBoundMemberAdapter(client){
  return async (identity,patch,confirmationId=null)=>{
    const {data,error}=await client.rpc(confirmationId?'confirm_verified_member_profile':'update_verified_member',{p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject,p_patch:patch,...(confirmationId?{p_confirmation_id:confirmationId}:{})});
    if(error)throw new Error('member_update_unavailable');
    return data===true;
  };
}
