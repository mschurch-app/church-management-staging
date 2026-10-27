import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
const CHANNEL_ID = '2011645391';
const APP_ORIGIN = 'https://mscos.mchurch.online';
const ENTITIES = new Set(['mplus', 'shine', 'tcsc']);

type Staff = { id: string; role: string; entityKeys: string[] };
type Body = Record<string, unknown>;

class ApiError extends Error {
  status: number;
  code: string;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}

function headers(origin: string) {
  return {
    ...(origin === APP_ORIGIN ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-headers': 'authorization,content-type,apikey',
    'access-control-allow-methods': 'POST,OPTIONS',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'Origin',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}
function json(origin: string, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: headers(origin) });
}
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new ApiError('unavailable', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function verifyLineIdToken(token: string) {
  if (!token || token.length > 8192) return null;
  try {
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token, client_id: CHANNEL_ID }),
    });
    if (!response.ok) return null;
    const claims = await response.json(), now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'https://access.line.me' || claims.aud !== CHANNEL_ID ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
      typeof claims.sub !== 'string' || !/^U[0-9a-f]{32}$/.test(claims.sub)) return null;
    return claims.sub as string;
  } catch { return null; }
}
async function staffFromToken(db: ReturnType<typeof adminClient>, token: string): Promise<Staff> {
  const appUser=await db.auth.getUser(token);
  if(!appUser.error&&appUser.data.user){
    const mapped=await db.rpc('get_pastoral_staff_for_app_user',{p_user:appUser.data.user.id});
    if(!mapped.error&&mapped.data)return {id:mapped.data.id,role:mapped.data.role,entityKeys:mapped.data.entityKeys||[]};
  }
  const subject = await verifyLineIdToken(token);
  if (!subject) throw new ApiError('login_required', 401);
  const { data, error } = await db.from('pastoral_staff').select('id,role,is_active').eq('line_subject', subject).maybeSingle();
  if (error) throw new ApiError('unavailable', 503);
  if (!data?.is_active) throw new ApiError('staff_forbidden', 403);
  const access = await db.from('pastoral_staff_access').select('entity_key').eq('staff_id', data.id);
  if (access.error) throw new ApiError('unavailable', 503);
  return { id: data.id, role: data.role, entityKeys: [...new Set((access.data || []).map(row => row.entity_key))] };
}
function requireEntity(staff: Staff, value: unknown) {
  if (typeof value !== 'string' || !ENTITIES.has(value) || !staff.entityKeys.includes(value)) throw new ApiError('entity_forbidden', 403);
  return value;
}
const canManage = (staff: Staff) => staff.role === 'pastor' || staff.role === 'admin';
async function googleAccessToken() {
  const db = adminClient();
  const saved = await db.rpc('pastoral_get_google_refresh_token');
  if (saved.error || typeof saved.data !== 'string' || !saved.data) throw new ApiError('drive_not_connected', 409);
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) throw new ApiError('drive_not_configured', 503);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: saved.data, grant_type: 'refresh_token' }),
  });
  if (!response.ok) throw new ApiError('drive_permission_required', 409);
  const result = await response.json();
  if (typeof result.access_token !== 'string') throw new ApiError('drive_not_connected', 409);
  return result.access_token as string;
}

const ROOTS={church:'1oSq-xNtJXRJ23Qp96ptRQTWNNDkk7yiN',school:'1iEPAzqEizJseq8BgIa7z-V0DRtbED6K1'};
const FOLDER='application/vnd.google-apps.folder';
async function drive(token:string,path:string,init:RequestInit={}){
 const response=await fetch('https://www.googleapis.com/drive/v3/'+path,{...init,headers:{authorization:'Bearer '+token,...init.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new ApiError(response.status===403||response.status===404?'drive_access_required':'drive_request_failed',response.status===403||response.status===404?409:502);
 return response.json();
}
function id(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{10,120}$/.test(value))throw new ApiError('invalid_folder');return value;}
async function within(token:string,fileId:string,root:string){
 let current=fileId;
 for(let depth=0;depth<40;depth++){
  const item=await drive(token,'files/'+encodeURIComponent(current)+'?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed,capabilities(canAddChildren),thumbnailLink,size');
  if(item.trashed)throw new ApiError('folder_forbidden',403);
  if(current===root)return;
  if(!item.parents?.length)break;current=item.parents[0];
 }
 throw new ApiError('folder_forbidden',403);
}
async function handle(request:Request,staff:Staff){
 requireEntity(staff,'mplus');
 const multipart=(request.headers.get('content-type')||'').includes('multipart/form-data');
 const form=multipart?await request.formData():null;
 const body=form?Object.fromEntries(form):await request.json();
 const category=body.category;
 if(category!=='church'&&category!=='school')throw new ApiError('invalid_category');
 const root=ROOTS[category],folderId=id(body.folderId||root),token=await googleAccessToken();
 await within(token,folderId,root);
 const folder=await drive(token,'files/'+encodeURIComponent(folderId)+'?supportsAllDrives=true&fields=id,name,mimeType,capabilities(canAddChildren)');
 if(folder.mimeType!==FOLDER)throw new ApiError('invalid_folder');
 if(body.action==='list'){
  const query=new URLSearchParams({q:`'${folderId}' in parents and trashed = false`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'100',orderBy:'folder,name',fields:'nextPageToken,files(id,name,mimeType,size,description,hasThumbnail)'});
  if(body.pageToken){if(typeof body.pageToken!=='string'||body.pageToken.length>4096)throw new ApiError('invalid_page');query.set('pageToken',body.pageToken);}
  const result=await drive(token,'files?'+query);
  return {ok:true,items:result.files||[],nextPageToken:result.nextPageToken||null,canAdd:folder.capabilities?.canAddChildren===true};
 }
 if(body.action==='preview'){
  const fileId=id(body.fileId);await within(token,fileId,root);
  const item=await drive(token,'files/'+encodeURIComponent(fileId)+'?supportsAllDrives=true&fields=id,mimeType,thumbnailLink');
  if(!item.mimeType?.startsWith('image/')||!item.thumbnailLink)return {ok:true,preview:null};
  const url=new URL(item.thumbnailLink);
  if(url.protocol!=='https:'||!/(^|\.)(googleusercontent\.com|googleapis\.com|google\.com)$/.test(url.hostname))throw new ApiError('invalid_preview');
  const image=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(!image.ok)throw new ApiError('preview_failed',502);
  const type=image.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(type||''))throw new ApiError('preview_failed',502);
  const bytes=new Uint8Array(await image.arrayBuffer());if(bytes.length>2000000)throw new ApiError('preview_failed',502);
  let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));
  return {ok:true,preview:`data:${type};base64,${btoa(binary)}`};
 }
 if(folder.capabilities?.canAddChildren!==true)throw new ApiError('folder_readonly',403);
 if(body.action==='create-folder'){
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>120||/[\x00-\x1f]/.test(name))throw new ApiError('invalid_name');
  const item=await drive(token,'files?supportsAllDrives=true&fields=id,name,mimeType',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,parents:[folderId]})});
  return {ok:true,item};
 }
 if(body.action==='upload'&&form){
  const file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>20*1024*1024)throw new ApiError('invalid_file');
  const name=file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,200)||'檔案';
  const metadata={name,parents:[folderId],description:typeof body.caption==='string'?body.caption.trim().slice(0,1000):''};
  // Start a resumable upload server-side; never expose the Google token or session URI.
  const start=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-upload-content-type':file.type||'application/octet-stream','x-upload-content-length':String(file.size)},body:JSON.stringify(metadata),redirect:'error',signal:AbortSignal.timeout(15000)});
  const location=start.headers.get('location');if(!start.ok||!location)throw new ApiError('upload_failed',502);
  const target=new URL(location);if(target.protocol!=='https:'||target.hostname!=='www.googleapis.com')throw new ApiError('upload_failed',502);
  const upload=await fetch(target,{method:'PUT',headers:{'content-type':file.type||'application/octet-stream'},body:file,redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!upload.ok)throw new ApiError('upload_failed',502);
  return {ok:true,item:await upload.json()};
 }
 throw new ApiError('invalid_action');
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
 if(request.method!=='POST'||origin!==APP_ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);
 try{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new ApiError('login_required',401);
  const staff=await staffFromToken(adminClient(),token);
  return json(origin,await handle(request,staff));
 }catch(error){return json(origin,{ok:false,error:error instanceof ApiError?error.code:'unavailable'},error instanceof ApiError?error.status:503);}
});
