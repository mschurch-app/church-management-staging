export function makeBoundMemberAdapter(client){
  return async (identity,patch)=>{
    const {data,error}=await client.rpc('update_verified_member',{p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject,p_patch:patch});
    if(error)throw new Error('member_update_unavailable');
    return data===true;
  };
}
