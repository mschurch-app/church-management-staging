import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/sermon-social-review/index.ts',import.meta.url),'utf8');
const start=source.indexOf('function legacySocialImage('),end=source.indexOf('\nasync function subtitleState(',start);
assert(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
const storageOrigin='https://example.supabase.co';
const legacy=`${storageOrigin}/storage/v1/object/public/church-media/sermon-social/2026-07-19-options/card-knees-up-a.jpg`;
const app='https://mscos.mchurch.online/assets/sermon-social/2026-06-28-options/card-knees-up-a.jpg?v=20261016a';
const bytes=new Uint8Array([0xff,0xd8,0xff,0xd9]);
const uploads=[];
const draft={status:'approved',review_stage:'completed',social_media_type:'image',social_image_url:legacy};
const db={
 storage:{from(bucket){
  if(bucket==='church-media')return {info:async path=>({data:{size:bytes.length},error:path.includes('sermon-social/')?null:Error('wrong path')}),download:async()=>({data:new Blob([bytes]),error:null})};
  assert.equal(bucket,'church-website-public-media');
  return {info:async()=>({data:{size:bytes.length},error:null}),upload:async(path,data,options)=>{uploads.push({path,data,options});return {error:null};}};
 }},
 from(table){
  assert.equal(table,'sermon_social_drafts');
  const query={select(){return query;},eq(){return query;},update(patch){Object.assign(draft,patch);return query;},single:async()=>({data:{...draft},error:null}),maybeSingle:async()=>({data:{id:'draft'},error:null})};
  return query;
 },
};
const context={URL,Deno:{env:{get:()=>storageOrigin}},APP:'https://mscos.mchurch.online',MEDIA:`${storageOrigin}/storage/v1/object/public/church-website-public-media/`,crypto:globalThis.crypto,Uint8Array,Blob,Response,AbortSignal,atob,decodeURIComponent,encodeURIComponent,Date,RegExp,String,Number,Array,Error,TextEncoder,fetch:async()=>new Response(new Blob([bytes]),{status:200,headers:{'content-length':String(bytes.length)}})};
const {legacySocialImage,appSocialImage,persistSocialImage,ensureApprovedSermonImage}=vm.runInNewContext(`${code}\n({legacySocialImage,appSocialImage,persistSocialImage,ensureApprovedSermonImage})`,context);

assert.equal(legacySocialImage(legacy)?.path,'sermon-social/2026-07-19-options/card-knees-up-a.jpg');
assert.equal(legacySocialImage(legacy.replace(storageOrigin,'https://evil.example')),null);
assert.equal(appSocialImage(app)?.mime,'image/jpeg');
assert.equal(appSocialImage(app.replace('?v=20261016a','?redirect=evil')),null);
await ensureApprovedSermonImage(db,'draft');
assert.match(draft.social_image_url,/church-website-public-media\/M%2B\/sermons\/draft\/[a-f0-9]{64}\.jpg$/);
assert.equal(uploads.length,1);
assert.equal(uploads[0].options.contentType,'image/jpeg');
assert.equal(await persistSocialImage(db,'draft',draft.social_image_url),draft.social_image_url);
assert.equal(uploads.length,1);
assert.match(await persistSocialImage(db,'draft',app),/church-website-public-media\/M%2B\/sermons\/draft\/[a-f0-9]{64}\.jpg$/);
assert.equal(uploads.length,2);
await assert.rejects(()=>persistSocialImage(db,'draft','https://evil.example/photo.jpg'),/sermon_image_invalid/);
console.log('sermon social media location: legacy, site and canonical image checks passed');
