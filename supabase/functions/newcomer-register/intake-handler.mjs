const churches=new Set(['M+','SHiNE']);
const safe=(v,max,required=false)=>{
  if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('invalid_input');
  return v.trim();
};
export function normalizeSubmission(body,{requireChallenge=true,legacyBirthday=false}={}){
  if(!body||typeof body!=='object'||Array.isArray(body)||!churches.has(body.church))throw new Error('invalid_input');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id||''))throw new Error('invalid_input');
  const common=['kind','church','request_id','challenge'];
  const fields={prayer:['name','group','title','content','private'],newcomer:['name','phone','district','note','birthday','gender','age_group','source','feelings','interests'],comment:['prayer_id','name','comment'],hand:['prayer_id']}[body.kind];
  if(!fields||Object.keys(body).some(k=>![...common,...fields].includes(k)))throw new Error('invalid_input');
  const name=body.kind==='hand'?null:safe(body.name,80,true);
  let payload;
  if(body.kind==='prayer'){
    if(typeof body.private!=='boolean')throw new Error('invalid_input');
    payload={author_name:name,group_name:safe(body.group||'',80),title:safe(body.title,120,true),content:safe(body.content,5000,true),is_private:body.private};
  }else if(body.kind==='newcomer'){
    const list=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.length>(legacyBirthday?30:20))throw new Error('invalid_input');return value.map(v=>safe(v,100,true));};
    const birthday=safe(body.birthday||'',legacyBirthday?40:10);
    if(!legacyBirthday&&birthday&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(Date.parse(birthday))||new Date(birthday).toISOString().slice(0,10)!==birthday))throw new Error('invalid_input');
    payload={name,phone:safe(body.phone||'',40),district:safe(body.district||'',100),memo:safe(body.note||'',10000),birthday:birthday||null,gender:safe(body.gender||'',100),age_group:safe(body.age_group||'',100),know_us_from:safe(body.source||'',300),desired_feelings:list(body.feelings),interest_tags:list(body.interests)};
  }else{
    if(typeof body.prayer_id==='number'&&!Number.isSafeInteger(body.prayer_id))throw new Error('invalid_input');
    const prayer_id=String(body.prayer_id??'');
    if(!/^[1-9]\d{0,18}$/.test(prayer_id)||BigInt(prayer_id)>9223372036854775807n)throw new Error('invalid_input');
    payload={prayer_id};
    if(body.kind==='comment')Object.assign(payload,{author_name:name,comment_text:safe(body.comment,2000,true)});
  }
  return {kind:body.kind,church:body.church,request_id:body.request_id,payload,challenge:requireChallenge?safe(body.challenge,2048,true):undefined};
}
export function publicPrayer(row){
  // Defense in depth: never serialize raw rows, IDs from LINE, or pastoral notes.
  const result=Object.fromEntries(['id','author_name','group_name','title','content','hands_count','is_answered','created_at','expires_at'].map(k=>[k,row[k]]));
  result.prayer_comments=(row.prayer_comments||[]).filter(c=>c.church_id===row.church_id&&String(c.prayer_id)===String(row.id)).slice(0,50).map(c=>Object.fromEntries(['id','author_name','comment_text','created_at'].map(k=>[k,c[k]])));
  return result;
}
export function makeIntakeHandler({listPublic,submit,verifyChallenge,origin='https://mschurch-app.github.io'}){
  return async request=>{
    const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
    const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:cors});
    if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return response(403,{error:'origin_rejected'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
    try{
      if(request.method==='GET'){
        const church=new URL(request.url).searchParams.get('church');
        if(!churches.has(church))return response(400,{error:'invalid_church'});
        const rows=await listPublic(church);
        return response(200,{prayers:rows.filter(r=>r.church_id===church&&r.is_private===false&&Date.parse(r.expires_at)>Date.now()).slice(0,100).map(publicPrayer)});
      }
      if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
      if(!request.headers.get('content-type')?.startsWith('application/json'))return response(415,{error:'json_required'});
      const reader=request.body?.getReader();
      if(!reader)return response(400,{error:'invalid_input'});
      let size=0;const chunks=[];
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return response(413,{error:'too_large'});}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
      let input;
      try{input=normalizeSubmission(JSON.parse(new TextDecoder().decode(bytes)));}catch{return response(400,{error:'invalid_input'});}
      if(!await verifyChallenge(input.challenge))return response(403,{error:'verification_failed'});
      const {challenge,...record}=input;
      const status=await submit(record);
      if(status==='limited')return response(429,{error:'try_later'});
      if(status==='unavailable')return response(404,{error:'prayer_unavailable'});
      if(status!=='accepted')return response(503,{error:'temporarily_unavailable'});
      // Successful storage does not assert notification delivery.
      return response(201,{accepted:true});
    }catch{return response(503,{error:'temporarily_unavailable'});}
  };
}
