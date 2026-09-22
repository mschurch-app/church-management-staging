export function submissionState(createId=()=>crypto.randomUUID()) {
 let pending=null,busy=false;
 return {
  begin(payload) {
   if(busy)throw new Error('正在送出，請稍候。');
   const signature=JSON.stringify(payload);
   if(!pending||pending.signature!==signature)pending={signature,id:createId()};
   busy=true;
   return pending.id;
  },
  finish(success) {busy=false;if(success)pending=null;}
 };
}
