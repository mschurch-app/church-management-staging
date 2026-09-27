import {makeMemberHandler} from './member-http.mjs';
import {makeBindingRequester} from './binding-request.mjs';
import {makeBoundMemberAdapter} from './member-binding-adapter.mjs';
import {notifyBindingReview} from './binding-review-notification.mjs';

// The client is a server-only service client, never the frontend publishable client.
export function makeMemberService({client,verifyIdentity,consumeEntry,consumeLimit,enabled=false,origin}){
  return makeMemberHandler({enabled,verifyIdentity,consumeEntry,consumeLimit,origin,update:makeBoundMemberAdapter(client),
    status:async identity=>{
      const {data,error}=await client.rpc('get_verified_member_status',{p_church:identity.church,p_channel:identity.channel,p_subject:identity.subject});
      if(error)throw new Error('status_unavailable');return data;
    },
    requestBinding:async(identity,input)=>{
      const result=await makeBindingRequester({client,verifyIdentity:async()=>identity})(input);
      if(result.received===true){
        // Notification is deliberately best effort: a LINE outage must never lose the application.
        await notifyBindingReview({client,requestId:input.request_id,church:identity.church,name:input.name,phone:input.phone}).catch(()=>{});
      }
      return result.received===true;
    }
  });
}
