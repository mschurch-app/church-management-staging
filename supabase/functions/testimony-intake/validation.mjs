export const TYPES = Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'});
export const CATEGORIES=['信仰歷程','禱告與盼望','家庭與關係','工作與生活','服事與關懷','其他'];
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateSubmission(input){
 const text=(key,max,required=true)=>{const v=String(input[key]||'').trim();if(v.length>max||required&&!v)throw Error('invalid_input');return v;};
 const name=text('name',40),contact=text('contact',100),title=text('title',60),body=text('body',6000,false),mode=input.displayMode;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)&&!/^\+?[\d ()-]{8,25}$/.test(contact))throw Error('invalid_contact');
 if(!['name','nickname','anonymous'].includes(mode)||!CATEGORIES.includes(input.category))throw Error('invalid_input');
 const display_name=mode==='anonymous'?'匿名分享':mode==='name'?name:text('nickname',30);
 const files=input.files;if(!Array.isArray(files)||files.length>9)throw Error('invalid_files');
 let photos=0,videos=0;
 const media=files.map((f,i)=>{const kind=String(f.type||'').startsWith('video/')?'video':'photo',max=kind==='video'?50*1024**2:10*1024**2;
  if(!TYPES[f.type]||!Number.isSafeInteger(f.size)||f.size<1||f.size>max||kind==='video'&&++videos>1||kind==='photo'&&++photos>8)throw Error('invalid_files');
  return {slot:i,kind,type:f.type,size:f.size,extension:TYPES[f.type]};
 });
 if(!body&&!media.length)throw Error('content_required');
 if(input.consent!==true||media.length&&input.mediaConsent!==true)throw Error('consent_required');
 return {name,contact,title,body,display_name,category:input.category,consent:true,media_consent:input.mediaConsent===true,media};
}
export function matchesMagic(bytes,type){
 const s=String.fromCharCode(...bytes),at=(offset,value)=>s.slice(offset,offset+value.length)===value;
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 if(type==='image/webp')return at(0,'RIFF')&&at(8,'WEBP');
 if(type==='video/webm')return [26,69,223,163].every((b,i)=>bytes[i]===b);
 if(type==='image/heic'||type==='image/heif')return at(4,'ftyp')&&/heic|heix|mif1|msf1|hevc/.test(s.slice(8));
 return (type==='video/mp4'||type==='video/quicktime')&&(at(4,'ftyp')||at(4,'moov')||at(4,'mdat'));
}
