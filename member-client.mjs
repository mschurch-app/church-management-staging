import {welcomeLiffConfig} from './staging-config.mjs';
import {submissionState} from './submission-state.mjs';
export function makeMemberClient({liff,send,search,createId,onState=()=>{}}){
  const config=welcomeLiffConfig(search),submission=submissionState(createId);
  let generation=0,current={state:'signed_out'},busy=false;
  const publish=value=>{current=value;onState(value);return value;};
  function clear(){generation++;publish({state:'signed_out'});}
  async function run(work){
    if(busy)throw new Error('正在處理，請稍候。');
    busy=true;const ticket=++generation;publish({state:'loading'});
    try{const result=await work();if(ticket===generation)return publish(result);}
    catch{if(ticket===generation)publish({state:'error'});throw new Error('無法完成，請重新確認登入與申請狀態。');}
    finally{busy=false;}
  }
  async function call(action,extra={}){
    if(!liff.isLoggedIn())throw new Error('login_required');
    const idToken=liff.getIDToken();if(!idToken)throw new Error('login_required');
    return send({action,church:config.church,idToken,...extra});
  }
  return {
    clear,
    async connect(){return run(async()=>{
      await liff.init({liffId:config.liffId});
      if(!liff.isLoggedIn())return {state:'signed_out'};
      return call('status');
    });},
    login(){liff.login();},
    refresh(){return run(()=>call('status'));},
    request(name,phone){return run(async()=>{
      const payload={name,phone},id=submission.begin(payload);let received=false;
      try{const result=await call('request',{...payload,request_id:id});if(result?.received!==true)throw new Error();received=true;return await call('status');}
      finally{submission.finish(received);}
    });},
    update(patch){
      if(current.state!=='approved')return Promise.reject(new Error('請先完成身份綁定。'));
      return run(async()=>{const result=await call('update',{patch});if(result?.updated!==true)throw new Error();return call('status');});
    }
  };
}
