import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const CHANNEL_ID = '2011645391';
const APP_ORIGIN = 'https://mscos.mchurch.online';
const ENTITIES = new Set(['mplus', 'shine', 'tcsc']);
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
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
function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function taipeiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
async function listMemos(db: ReturnType<typeof adminClient>, staff: Staff, entityKey: string) {
  const [team, personal] = await Promise.all([
    db.from('pastoral_coworker_memos').select('id,title,content,visibility,due_on,created_by,created_at,updated_at')
      .eq('entity_key', entityKey).eq('visibility', 'team').is('archived_at', null).order('created_at', { ascending: false }).limit(100),
    db.from('pastoral_coworker_memos').select('id,title,content,visibility,due_on,created_by,created_at,updated_at')
      .eq('entity_key', entityKey).eq('visibility', 'personal').eq('created_by', staff.id).is('archived_at', null).order('created_at', { ascending: false }).limit(100),
  ]);
  if (team.error || personal.error) throw new ApiError('unavailable', 503);
  return [...(personal.data || []), ...(team.data || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function verifyImage(file: File, bytes: Uint8Array) {
  if (!(file.type in MIME_EXT) || file.size < 100 || file.size > 10 * 1024 * 1024) return false;
  if (file.type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
}
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
async function handleJson(db: ReturnType<typeof adminClient>, staff: Staff, body: Body) {
  const action = cleanText(body.action, 40);
  const entityKey = requireEntity(staff, body.entityKey);
  if (action === 'list-memos') return { ok: true, items: await listMemos(db, staff, entityKey) };
  if (action === 'create-memo') {
    const title = cleanText(body.title, 160), content = cleanText(body.content, 8000);
    const visibility = body.visibility === 'team' ? 'team' : 'personal';
    const dueOn = body.dueOn === '' || body.dueOn == null ? null : body.dueOn;
    if (!title || (dueOn && !validDate(dueOn))) throw new ApiError('invalid_memo');
    const result = await db.from('pastoral_coworker_memos').insert({
      entity_key: entityKey, title, content, visibility, due_on: dueOn,
      created_by: staff.id, updated_by: staff.id,
    }).select('id').single();
    if (result.error) throw new ApiError('unavailable', 503);
    return { ok: true, id: result.data.id };
  }
  if (action === 'archive-memo') {
    if (typeof body.memoId !== 'string') throw new ApiError('invalid_memo');
    const lookup = await db.from('pastoral_coworker_memos').select('id,created_by,visibility')
      .eq('id', body.memoId).eq('entity_key', entityKey).is('archived_at', null).maybeSingle();
    if (lookup.error) throw new ApiError('unavailable', 503);
    if (!lookup.data) throw new ApiError('memo_not_found', 404);
    if (lookup.data.created_by !== staff.id && !canManage(staff)) throw new ApiError('forbidden', 403);
    const archived = await db.from('pastoral_coworker_memos').update({ archived_at: new Date().toISOString(), updated_by: staff.id })
      .eq('id', body.memoId).eq('entity_key', entityKey);
    if (archived.error) throw new ApiError('unavailable', 503);
    return { ok: true };
  }
  if (action === 'today-attendance') {
    const result = await db.from('pastoral_staff_attendance').select('id,work_date,clocked_in_at,clocked_out_at,note')
      .eq('entity_key', entityKey).eq('staff_id', staff.id).eq('work_date', taipeiDate()).maybeSingle();
    if (result.error) throw new ApiError('unavailable', 503);
    return { ok: true, item: result.data || null };
  }
  if (action === 'clock-in' || action === 'clock-out') {
    const today = taipeiDate();
    if (action === 'clock-in') {
      const existing = await db.from('pastoral_staff_attendance').select('id').eq('entity_key', entityKey).eq('staff_id', staff.id).eq('work_date', today).maybeSingle();
      if (existing.error) throw new ApiError('unavailable', 503);
      if (existing.data) throw new ApiError('already_clocked_in', 409);
      const saved = await db.from('pastoral_staff_attendance').insert({ entity_key: entityKey, staff_id: staff.id, work_date: today, clocked_in_at: new Date().toISOString() }).select('id').single();
      if (saved.error) throw new ApiError('unavailable', 503);
      return { ok: true, itemId: saved.data.id };
    }
    const existing = await db.from('pastoral_staff_attendance').select('id,clocked_in_at,clocked_out_at')
      .eq('entity_key', entityKey).eq('staff_id', staff.id).eq('work_date', today).maybeSingle();
    if (existing.error) throw new ApiError('unavailable', 503);
    if (!existing.data?.clocked_in_at) throw new ApiError('clock_in_required', 409);
    if (existing.data.clocked_out_at) throw new ApiError('already_clocked_out', 409);
    const saved = await db.from('pastoral_staff_attendance').update({ clocked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', existing.data.id).is('clocked_out_at', null);
    if (saved.error) throw new ApiError('unavailable', 503);
    return { ok: true };
  }
  if (action === 'list-leave') {
    let query = db.from('pastoral_staff_leave_requests').select('id,staff_id,start_date,end_date,period,leave_type,reason,status,review_note,created_at,reviewed_at')
      .eq('entity_key', entityKey).order('created_at', { ascending: false }).limit(100);
    if (!canManage(staff)) query = query.eq('staff_id', staff.id);
    const result = await query;
    if (result.error) throw new ApiError('unavailable', 503);
    return { ok: true, items: result.data || [] };
  }
  if (action === 'create-leave') {
    if (!validDate(body.startDate) || !validDate(body.endDate) || body.endDate < body.startDate ||
      Date.parse(body.endDate + 'T00:00:00Z') - Date.parse(body.startDate + 'T00:00:00Z') > 90 * 86400000) throw new ApiError('invalid_leave');
    const period = ['full_day', 'morning', 'afternoon'].includes(String(body.period)) ? String(body.period) : '';
    const leaveType = ['annual', 'personal', 'sick', 'family', 'other'].includes(String(body.leaveType)) ? String(body.leaveType) : '';
    const reason = cleanText(body.reason, 1000);
    if (!period || !leaveType) throw new ApiError('invalid_leave');
    const overlap = await db.from('pastoral_staff_leave_requests').select('id')
      .eq('entity_key', entityKey).eq('staff_id', staff.id).in('status', ['pending', 'approved'])
      .lte('start_date', body.endDate).gte('end_date', body.startDate).limit(1);
    if (overlap.error) throw new ApiError('unavailable', 503);
    if (overlap.data?.length) throw new ApiError('leave_overlap', 409);
    const saved = await db.from('pastoral_staff_leave_requests').insert({
      entity_key: entityKey, staff_id: staff.id, start_date: body.startDate, end_date: body.endDate,
      period, leave_type: leaveType, reason,
    }).select('id').single();
    if (saved.error) throw new ApiError('unavailable', 503);
    return { ok: true, id: saved.data.id };
  }
  if (action === 'review-leave') {
    if (!canManage(staff)) throw new ApiError('forbidden', 403);
    if (typeof body.leaveId !== 'string' || !['approved', 'rejected'].includes(String(body.decision))) throw new ApiError('invalid_leave');
    const saved = await db.from('pastoral_staff_leave_requests').update({
      status: body.decision, reviewed_by: staff.id, reviewed_at: new Date().toISOString(),
      review_note: cleanText(body.reviewNote, 500), updated_at: new Date().toISOString(),
    }).eq('id', body.leaveId).eq('entity_key', entityKey).eq('status', 'pending').select('id').maybeSingle();
    if (saved.error) throw new ApiError('unavailable', 503);
    if (!saved.data) throw new ApiError('leave_not_pending', 409);
    return { ok: true };
  }
  if (action === 'picker-config') {
    if (!canManage(staff)) throw new ApiError('forbidden', 403);
    const apiKey = Deno.env.get('GOOGLE_PICKER_API_KEY') || '';
    const appId = Deno.env.get('GOOGLE_CLOUD_PROJECT_NUMBER') || '';
    if (!apiKey || !appId) throw new ApiError('drive_picker_not_configured', 503);
    return { ok: true, accessToken: await googleAccessToken(), apiKey, appId };
  }
  if (action === 'set-drive-folder') {
    if (!canManage(staff)) throw new ApiError('forbidden', 403);
    const folderId = cleanText(body.folderId, 200);
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) throw new ApiError('invalid_folder', 400);
    const token = await googleAccessToken();
    const check = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType,capabilities(canAddChildren)`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!check.ok) throw new ApiError('drive_folder_access_required', 409);
    const folder = await check.json();
    if (folder.mimeType !== 'application/vnd.google-apps.folder' || folder.capabilities?.canAddChildren !== true) throw new ApiError('drive_folder_forbidden', 403);
    const saved = await db.from('pastoral_drive_folder_settings').upsert({ entity_key: entityKey, folder_id: folderId, configured_by: staff.id, configured_at: new Date().toISOString() });
    if (saved.error) throw new ApiError('unavailable', 503);
    return { ok: true, folderName: folder.name };
  }
  if (action === 'list-photos') {
    const result = await db.from('pastoral_photo_archives').select('id,drive_file_id,file_name,mime_type,size_bytes,caption,album,uploaded_by,created_at')
      .eq('entity_key', entityKey).order('created_at', { ascending: false }).limit(100);
    if (result.error) throw new ApiError('unavailable', 503);
    return { ok: true, items: result.data || [] };
  }
  throw new ApiError('invalid_action', 400);
}

async function uploadPhoto(request: Request, db: ReturnType<typeof adminClient>, staff: Staff, form: FormData) {
  const entityKey = requireEntity(staff, form.get('entityKey'));
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError('invalid_photo', 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!verifyImage(file, bytes)) throw new ApiError('invalid_photo', 400);
  const setting = await db.from('pastoral_drive_folder_settings').select('folder_id').eq('entity_key', entityKey).maybeSingle();
  if (setting.error) throw new ApiError('unavailable', 503);
  if (!setting.data?.folder_id) throw new ApiError('drive_folder_not_set', 409);
  const token = await googleAccessToken();
  const ext = MIME_EXT[file.type];
  const safeName = file.name.normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').slice(0, 100) || `photo.${ext}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${stamp}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
  const metadata = { name, mimeType: file.type, parents: [setting.data.folder_id], description: cleanText(form.get('caption'), 1000) };
  const upload = new FormData();
  upload.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' }));
  upload.append('file', new Blob([bytes], { type: file.type }), name);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${token}` }, body: upload,
  });
  if (!response.ok) {
    if (response.status === 403) throw new ApiError('drive_permission_required', 409);
    throw new ApiError('drive_upload_failed', 502);
  }
  const fileInfo = await response.json();
  const saved = await db.from('pastoral_photo_archives').insert({
    entity_key: entityKey, drive_file_id: fileInfo.id, file_name: name, mime_type: file.type,
    size_bytes: bytes.length, caption: cleanText(form.get('caption'), 1000),
    album: cleanText(form.get('album'), 120), uploaded_by: staff.id,
  });
  if (saved.error) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileInfo.id)}?supportsAllDrives=true`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    throw new ApiError('unavailable', 503);
  }
  return json(APP_ORIGIN, { ok: true, fileName: name, fileId: fileInfo.id });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return origin === APP_ORIGIN ? new Response('ok', { headers: headers(origin) }) : json(origin, { ok: false, error: 'forbidden' }, 403);
  if (request.method !== 'POST' || origin !== APP_ORIGIN) return json(origin, { ok: false, error: 'forbidden' }, 403);
  let db: ReturnType<typeof adminClient>;
  try { db = adminClient(); } catch { return json(origin, { ok: false, error: 'unavailable' }, 503); }

  const isMultipart = (request.headers.get('content-type') || '').includes('multipart/form-data');
  let body: Body = {}, form: FormData | null = null, token = '';
  try {
    if (isMultipart) {
      form = await request.formData();
      token = String(form.get('idToken') || '');
      body = { action: form.get('action'), entityKey: form.get('entityKey'), caption: form.get('caption'), album: form.get('album') };
    } else {
      body = await request.json();
      token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    }
  } catch { return json(origin, { ok: false, error: 'invalid_request' }, 400); }

  try {
    const staff = await staffFromToken(db, token);
    if (isMultipart && form && body.action === 'upload-photo') return await uploadPhoto(request, db, staff, form);
    return json(origin, await handleJson(db, staff, body));
  } catch (error) {
    if (error instanceof ApiError) return json(origin, { ok: false, error: error.code }, error.status);
    console.error('Coworker tools request failed', error instanceof Error ? error.message : 'unknown error');
    return json(origin, { ok: false, error: 'unavailable' }, 503);
  }
});
