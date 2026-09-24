import {LINE_LOGIN_CHANNEL_ID, PASTORAL_LIFF_ID, PASTORAL_AUTH_ENDPOINT} from './config.mjs?v=20260924-3';

let initialization;
export function loginConfigured() {
  try {
    return PASTORAL_LIFF_ID.startsWith(`${LINE_LOGIN_CHANNEL_ID}-`) && new URL(PASTORAL_AUTH_ENDPOINT).protocol === 'https:';
  } catch { return false; }
}

async function initialize() {
  if (!loginConfigured()) throw new Error('幕僚專用 LINE 入口尚在設定中，請等待管理者提供啟用通知。');
  if (!initialization) initialization = (async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('LINE 登入服務無法載入，請稍後再試。'));
      document.head.append(script);
    });
    await window.liff.init({liffId: PASTORAL_LIFF_ID});
  })();
  try { await initialization; } catch (error) { initialization = undefined; throw error; }
}

export async function authenticateStaff({interactive = false} = {}) {
  await initialize();
  if (!window.liff.isLoggedIn()) {
    if (interactive) window.liff.login({redirectUri: new URL('./', location.href).href});
    throw new Error('請先使用已獲授權的 LINE 帳號登入。');
  }
  const token = window.liff.getIDToken();
  if (!token) throw new Error('LINE 登入資訊已失效，請重新登入。');
  let response;
  try {
    response = await fetch(PASTORAL_AUTH_ENDPOINT, {
      method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type':'application/json'},
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error('暫時無法確認幕僚權限，請稍後再試。'); }
  if (response.status === 401) {
    if (window.liff.isLoggedIn()) window.liff.logout();
    throw new Error('LINE 登入已失效，請重新登入。');
  }
  if (response.status === 403) throw new Error('此 LINE 帳號尚未獲授權，請聯絡牧師或系統管理者。');
  if (!response.ok) throw new Error('幕僚登入尚未開放或暫時無法使用，請稍後再試。');
  const {staff} = await response.json();
  if (!staff || !['pastor','secretary','admin'].includes(staff.role) || typeof staff.name !== 'string' ||
      !Array.isArray(staff.churches) || !staff.churches.length || staff.churches.some(c => !['M+','SHiNE','台灣基督教社會關懷協會'].includes(c))) {
    throw new Error('無法確認幕僚權限，請聯絡系統管理者。');
  }
  return staff;
}

export function signOut() {
  if (window.liff?.isLoggedIn()) window.liff.logout();
  location.replace(new URL('./', location.href).href);
}
