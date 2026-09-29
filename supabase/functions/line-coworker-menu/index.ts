import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type LineSource = { type?: string; userId?: string; groupId?: string };
type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};
type WebhookBody = { events?: LineEvent[] };

const APP_URL = 'https://mscos.mchurch.online/pastoral/';
const LIFF_ID = '2011645391-VGkQRZ9d';
const featureLabels: Record<string, string> = {
  memo: '備忘錄與工作協作',
  calendar: '教會行事曆',
  care: '會友關懷',
  attendance: '出勤請假',
  photos: '照片上傳歸檔',
  church: '教會管理系統',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function validSignature(body: Uint8Array, signature: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
    const expected = btoa(String.fromCharCode(...digest));
    return constantTimeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature));
  } catch {
    return false;
  }
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function menuMessage() {
  const items = [
    ['📝', '備忘錄', 'memo'],
    ['📅', '教會行事曆', 'calendar'],
    ['💛', '會友關懷', 'care'],
    ['🕒', '出勤請假', 'attendance'],
    ['📷', '照片上傳歸檔', 'photos'],
    ['🏠', '教會管理系統', 'church'],
  ] as const;

  const tiles = items.map(([icon, label, key]) => ({
    type: 'box',
    layout: 'vertical',
    flex: 1,
    backgroundColor: '#F4F7F5',
    cornerRadius: '12px',
    paddingAll: '12px',
    action: ['memo', 'attendance', 'photos', 'calendar'].includes(key)
      ? { type: 'uri', label, uri: `https://liff.line.me/${LIFF_ID}/${key === 'memo' || key === 'attendance' || key === 'photos' ? 'coworker-tools.html?tab=' + (key === 'photos' ? 'photos' : key === 'attendance' ? 'attendance' : 'memo') : 'workspace.html'}` }
      : { type: 'postback', label, data: `feature=${key}` },
    contents: [
      { type: 'text', text: icon, size: 'xl', align: 'center' },
      { type: 'text', text: label, size: 'sm', weight: 'bold', align: 'center', wrap: true, margin: 'sm', color: '#24483E' },
    ],
  }));
  const rows = [tiles.slice(0, 2), tiles.slice(2, 4), tiles.slice(4, 6)].map(contents => ({
    type: 'box', layout: 'horizontal', spacing: 'sm', contents,
  }));

  return {
    type: 'flex',
    altText: '教會同工常用功能選單',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#24483E',
        paddingAll: '18px',
        contents: [
          { type: 'text', text: '教會同工常用功能', color: '#FFFFFF', weight: 'bold', size: 'lg' },
          { type: 'text', text: '點選功能，在 LINE 內開啟同工工具或取得說明', color: '#E8F0EC', size: 'xs', margin: 'sm', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: rows },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: [{
          type: 'text',
          text: '會友姓名、代禱內容及個人出勤資料，請勿貼在群組。',
          size: 'xs',
          color: '#6B7280',
          wrap: true,
        }],
      },
    },
  };
}

function featureReply(key: string) {
  const name = featureLabels[key];
  if (!name) return null;
  if (key === 'memo' || key === 'calendar') {
    return {
      type: 'text',
      text: `已選擇「${name}」。請在開啟的同工工具頁使用 LINE 登入。`,
    };
  }
  if (key === 'care') {
    return {
      type: 'text',
      text: '會友關懷資料包含個人隱私。請不要在群組傳送姓名、電話或代禱內容；請改用同工工作台或一對一聯絡。',
    };
  }
  if (key === 'church') {
    return {
      type: 'text',
      text: `已選擇「${name}」。教會管理系統使用既有登入入口；同工工作台登入入口：${APP_URL}`,
    };
  }
  return {
    type: 'text',
    text: `已收到「${name}」需求。這項功能尚未接到 LINE 群組，接通前請沿用教會原有流程。`,
  };
}

async function reply(replyToken: string, messages: unknown[]) {
  const token = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') || Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
  if (!token) throw new Error('Missing LINE Messaging API access token');
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!response.ok) throw new Error(`LINE reply failed: ${response.status}`);
}

async function processEvent(event: LineEvent) {
  const allowedGroupId = Deno.env.get('LINE_COWORKER_GROUP_ID') || '';
  if (event.source?.type !== 'group' || !event.source.groupId || event.source.groupId !== allowedGroupId || !event.replyToken) return;
  if (event.type !== 'message' && event.type !== 'postback') return;

  if (event.type === 'message' && event.message?.type === 'text' && event.message.text?.trim().toLowerCase() === 'help') {
    await reply(event.replyToken, [menuMessage()]);
    return;
  }

  if (event.type === 'postback') {
    const key = new URLSearchParams(event.postback?.data || '').get('feature') || '';
    const message = featureReply(key);
    if (message) await reply(event.replyToken, [message]);
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('LINE_CHANNEL_SECRET') || '';
  const allowedGroupId = Deno.env.get('LINE_COWORKER_GROUP_ID') || '';
  if (!secret || !allowedGroupId) return json({ ok: false, error: 'webhook_not_configured' }, 503);
  const signature = request.headers.get('x-line-signature') || '';
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.length > 1024 * 1024) return json({ ok: false, error: 'payload_too_large' }, 413);
  if (!signature || !await validSignature(rawBody, signature, secret)) {
    return json({ ok: false, error: 'invalid_signature' }, 401);
  }

  let payload: WebhookBody;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  for (const event of payload.events || []) {
    try {
      await processEvent(event);
    } catch (error) {
      console.error('LINE group menu event failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
  return json({ ok: true });
});
