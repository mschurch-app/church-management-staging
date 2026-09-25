export async function storePhoto(storage,photo){
 const bucket='newcomer-photos';
 const found=await storage.getBucket(bucket);
 if(found.error){
  const made=await storage.createBucket(bucket,{public:false,allowedMimeTypes:['image/jpeg'],fileSizeLimit:1048576});
  if(made.error){const retry=await storage.getBucket(bucket);if(retry.error||retry.data.public)throw Error('unavailable');}
 }else if(found.data.public)throw Error('unavailable');
 const api=storage.from(bucket);
 const uploaded=await api.upload(photo.path,photo.bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'60'});
 if(!uploaded.error)return;
 // Storage versions use either 400 or 409 for duplicate objects. Compare the
 // existing bytes, rather than treating every conflict as a successful upload.
 if(!['400','409'].includes(String(uploaded.error.statusCode)))throw Error('unavailable');
 const existing=await api.download(photo.path);
 if(existing.error||!existing.data||existing.data.size>1048576)throw Error('unavailable');
 const bytes=new Uint8Array(await existing.data.arrayBuffer());
 if(bytes.length!==photo.bytes.length||bytes.some((b,i)=>b!==photo.bytes[i]))throw Error('unavailable');
}
