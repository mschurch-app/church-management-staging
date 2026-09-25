import {normalizeSubmission} from './intake-handler.mjs';
export function makeNewcomerHandler({submit,enabled=false,preparePhoto,origin='https://mschurch-app.github.io'}){
 return async request=>{
  const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
  const result=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(!enabled)return result(503,{error:'unavailable'});
  if(request.headers.get('origin')!==origin)return result(403,{error:'origin_rejected'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
  if(request.method!=='POST')return result(405,{error:'method_not_allowed'});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return result(415,{error:'json_required'});
  try{
   const reader=request.body?.getReader();if(!reader)return result(400,{error:'invalid_input'});
   let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400000){await reader.cancel();return result(413,{error:'too_large'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let input;
   try{
    const raw=JSON.parse(new TextDecoder().decode(bytes));
    if(raw.kind!=='newcomer'||Object.hasOwn(raw,'challenge'))throw Error();
    // Public newcomer registration intentionally has no login or CAPTCHA.
    const photo=raw.photo;delete raw.photo;
    input=normalizeSubmission(raw,{requireChallenge:false,legacyBirthday:true});
    if(photo!==undefined){if(!preparePhoto)throw Error();input.photo=await preparePhoto(photo,input);input.payload.photo_url=input.photo.path;}
   }catch{return result(400,{error:'invalid_input'});}
   const outcome=await submit({request_id:input.request_id,church:input.church,payload:input.payload,photo:input.photo});
   if(outcome==='accepted')return result(201,{accepted:true});
   if(outcome==='limited')return result(429,{error:'try_later'});
   if(outcome==='conflict')return result(409,{error:'request_conflict'});
   return result(503,{error:'unavailable'});
  }catch{return result(503,{error:'unavailable'});}
 };
}
