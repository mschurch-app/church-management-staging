export function makeBindingRequester({verifyIdentity,client}){
  return async input=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['church','idToken','request_id','name','phone'].includes(key)))throw new Error('invalid_input');
    if(typeof input.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id))throw new Error('invalid_input');
    for(const [key,max] of [['name',80],['phone',40]])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)throw new Error('invalid_input');
    const identity=await verifyIdentity({church:input.church,idToken:input.idToken});
    const {data,error}=await client.rpc('submit_verified_binding_request',{p_id:input.request_id,p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject,p_name:input.name.trim(),p_phone:input.phone.trim()});
    if(error||data!==true)throw new Error('request_unavailable');
    return {received:true};
  };
}
