import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const enc = new TextEncoder();
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('YOUTUBE_OAUTH_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('YOUTUBE_OAUTH_CLIENT_SECRET') || '';
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const unb64 = (v: string) => Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - v.length % 4) % 4)), x => x.charCodeAt(0));

async function decryptGoogle(ciphertext: string, iv: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${SERVICE_KEY}:youtube-oauth-token:v1`));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  const value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return new TextDecoder().decode(value);
}
async function decryptInstagram(ciphertext: string, iv: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${SERVICE_KEY}:instagram-publishing:v1`));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  const value = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return new TextDecoder().decode(value);
}
async function googleToken() {
  const row = await db.from('youtube_oauth_connections')
    .select('refresh_token_ciphertext,refresh_token_iv,granted_scope')
    .eq('church_id', 'M+').eq('status', 'connected').maybeSingle();
  if (!row.data) throw new Error('google_not_connected');
  const refresh = await decryptGoogle(row.data.refresh_token_ciphertext, row.data.refresh_token_iv);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('google_token_refresh_failed');
  return { token: String(data.access_token), scopes: String(row.data.granted_scope || '') };
}
function taipeiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
async function getYoutube(token: string, date: string) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', date);
  url.searchParams.set('endDate', date);
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched,subscribersGained,subscribersLost');
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`youtube_analytics_${response.status}`);
  const values = data.rows?.[0] || [];
  return {
    views: Number(values[0] || 0),
    estimated_minutes_watched: Number(values[1] || 0),
    subscribers_gained: Number(values[2] || 0),
    subscribers_lost: Number(values[3] || 0),
    delayed_source: true
  };
}
async function discoverGaProperty(token: string) {
  const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const reason=String(data?.error?.status || data?.error?.details?.[0]?.reason || data?.error?.message || '').replace(/[^a-zA-Z0-9_. -]/g,'').slice(0,120); throw new Error(`analytics_admin_${response.status}${reason ? '_' + reason : ''}`); }
  const properties = (data.accountSummaries || []).flatMap((a: any) =>
    (a.propertySummaries || []).map((p: any) => ({ id: String(p.property || '').replace('properties/', ''), name: String(p.displayName || '') }))
  ).filter((p: any) => p.id);
  if (properties.length === 1) return properties[0];
  const matches = properties.filter((p: any) => /m\+|大雅|mchurch/i.test(p.name));
  if (matches.length === 1) return matches[0];
  throw new Error(properties.length ? 'ga4_property_selection_required' : 'ga4_property_not_found');
}
async function getWebsite(token: string, propertyId: string, date: string) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: date, endDate: date }], metrics: [
      { name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }
    ] }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`analytics_data_${response.status}`);
  const values = data.rows?.[0]?.metricValues || [];
  return { active_users: Number(values[0]?.value || 0), sessions: Number(values[1]?.value || 0), page_views: Number(values[2]?.value || 0), property_id: propertyId };
}
async function getInstagram(date: string) {
  const row = await db.from('instagram_publishing_connections')
    .select('instagram_user_id,access_token_ciphertext,access_token_iv,status')
    .eq('church_id', 'M+').eq('status', 'connected').maybeSingle();
  if (!row.data) throw new Error('instagram_not_connected');
  const token = await decryptInstagram(row.data.access_token_ciphertext, row.data.access_token_iv);
  const start = Math.floor(new Date(date + 'T00:00:00+08:00').getTime() / 1000);
  const end = start + 86400;
  const url = new URL(`https://graph.instagram.com/v24.0/${row.data.instagram_user_id}/insights`);
  url.searchParams.set('metric', 'views,reach,total_interactions');
  url.searchParams.set('period', 'day');
  url.searchParams.set('since', String(start));
  url.searchParams.set('until', String(end));
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 400 || response.status === 403 ? 'instagram_insights_authorization_required' : `instagram_insights_${response.status}`);
  const result: Record<string, number> = {};
  for (const metric of data.data || []) result[String(metric.name)] = Number(metric.values?.[0]?.value || metric.total_value?.value || 0);
  return result;
}
function message(date: string, website: any, youtube: any, instagram: any, status: Record<string, string>) {
  const lines = [`${date}，今天我們在線上持續與人相遇。`, ''];
  lines.push(status.website === 'ok' ? `🌐 網站｜${website.active_users} 位訪客・${website.page_views} 次瀏覽` : '🌐 網站｜資料暫候更新');
  lines.push(status.youtube === 'ok' ? `▶️ YouTube｜${youtube.views} 次觀看・${(Number(youtube.estimated_minutes_watched || 0) / 60).toFixed(1)} 小時陪伴` : '▶️ YouTube｜資料暫候更新');
  lines.push(status.instagram === 'ok' ? `📱 Instagram｜觸及 ${instagram.reach || 0} 人・互動 ${instagram.total_interactions || 0}` : '📱 Instagram｜待補洞察授權');
  lines.push('', '💡 今日觀察');
  const available = status.website === 'ok' || status.youtube === 'ok' || status.instagram === 'ok';
  lines.push(available ? '數據正在累積，持續記錄每一次接觸與陪伴。' : '部分平台資料仍在同步，完成後會自動補入報告。');
  if (status.facebook !== 'ok') lines.push('Facebook 洞察尚待連結。');
  return lines.join('\\n').slice(0, 1000);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const secret = req.headers.get('x-cron-secret') || '';
    const validation = await db.rpc('pastoral_validate_care_cron_secret', { p_secret: secret });
    if (validation.error || validation.data !== true) return json({ error: 'unauthorized' }, 401);

    const settingsResult = await db.from('traffic_reporting_settings').select('*').eq('church_id', 'M+').eq('enabled', true).maybeSingle();
    const settings = settingsResult.data;
    if (!settings) return json({ skipped: true, reason: 'disabled' });

    const date = taipeiDate();
    const sourceStatus: Record<string, string> = { website: 'pending', youtube: 'pending', instagram: 'pending', facebook: 'authorization_required' };
    let website: any = {}, youtube: any = {}, instagram: any = {};
    let gaPropertyId = settings.ga4_property_id as string | null;

    try {
      const google = await googleToken();
      try {
        youtube = await getYoutube(google.token, date);
        sourceStatus.youtube = 'ok';
      } catch (error) {
        sourceStatus.youtube = String((error as Error).message);
      }
      try {
        if (!gaPropertyId) {
          const property = await discoverGaProperty(google.token);
          gaPropertyId = property.id;
          await db.from('traffic_reporting_settings').update({ ga4_property_id: gaPropertyId, updated_at: new Date().toISOString() }).eq('church_id', 'M+');
        }
        website = await getWebsite(google.token, gaPropertyId!, date);
        sourceStatus.website = 'ok';
      } catch (error) {
        sourceStatus.website = String((error as Error).message);
      }
    } catch (error) {
      sourceStatus.youtube = sourceStatus.website = String((error as Error).message);
    }

    try {
      instagram = await getInstagram(date);
      sourceStatus.instagram = 'ok';
      await db.from('traffic_reporting_settings').update({ meta_insights_status: 'connected', updated_at: new Date().toISOString() }).eq('church_id', 'M+');
    } catch (error) {
      sourceStatus.instagram = String((error as Error).message);
      await db.from('traffic_reporting_settings').update({ meta_insights_status: sourceStatus.instagram.includes('authorization') ? 'authorization_required' : 'error', updated_at: new Date().toISOString() }).eq('church_id', 'M+');
    }

    const report = await db.from('daily_traffic_reports').upsert({
      church_id: 'M+', report_date: date, website, youtube, instagram, facebook: {}, source_status: sourceStatus, generated_at: new Date().toISOString()
    }, { onConflict: 'church_id,report_date' }).select('id').single();
    if (report.error) throw report.error;

    const sourceKey = `daily-traffic-report:${date}`;
    const existingNotification = await db.from('app_notifications').select('id')
      .eq('user_id', settings.recipient_user_id).eq('event_key', 'daily_traffic_report')
      .eq('source_key', sourceKey).maybeSingle();
    if (!existingNotification.data) {
      const notification = await db.from('app_notifications').insert({
        user_id: settings.recipient_user_id,
        church_id: 'M+',
        event_key: 'daily_traffic_report',
        source_key: sourceKey,
        title: '網站與社群每日流量報告',
        body: message(date, website, youtube, instagram, sourceStatus),
        target_url: '/admin-dashboard.html'
      });
      if (notification.error && notification.error.code !== '23505') throw notification.error;
    }
    const pushBody = message(date, website, youtube, instagram, sourceStatus);
    const pushResponse = await fetch(SUPABASE_URL + '/functions/v1/app-push-delivery', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({
        user_id: settings.recipient_user_id,
        title: '📊 M+ 每日數位牧養報告',
        body: pushBody,
        url: '/admin-dashboard.html',
        tag: 'daily-traffic-' + date
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!pushResponse.ok) console.error('push_delivery_' + pushResponse.status);
    return json({ ok: true, date, report_id: report.data.id, source_status: sourceStatus, push_sent: pushResponse.ok });
  } catch (error) {
    console.error(error);
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
