export function makeMemberLimiter(client){
  async function consume(args){const {data,error}=await client.rpc('consume_member_limit',args);if(error)throw new Error('limiter_unavailable');return data===true;}
  return {consumeEntry:()=>consume({p_stage:'entry'}),consumeLimit:(identity,action)=>consume({p_stage:'identity',p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject,p_action:action})};
}
