import { shiftDate, websiteSeries, youtubeSeries, snapshot, message } from './report.mjs';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const enc = new TextEncoder();
const errorCode = (error: unknown) => { const code = String((error as Error)?.message || 'upstream_failed'); return /^(google|youtube|analytics|ga4|invalid|website|instagram|upstream)_[A-Za-z0-9_]+$/.test(code) ? code : 'upstream_failed'; };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('YOUTUBE_OAUTH_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('YOUTUBE_OAUTH_CLIENT_SECRET') || '';
// Measurement ID installed on the public M+ website.
const MCHURCH_MEASUREMENT_ID = 'G-VPZZCKQ41B';
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
async function getYoutube(token: string, start: string, end: string) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', start);
  url.searchParams.set('endDate', end);
  url.searchParams.set('dimensions', 'day');
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched,subscribersGained,subscribersLost');
  url.searchParams.set('sort', 'day');
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`youtube_analytics_${response.status}`);
  return youtubeSeries(data);
}
async function gaProperties(token: string) {
  const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const reason=String(data?.error?.status || data?.error?.details?.[0]?.reason || data?.error?.message || '').replace(/[^a-zA-Z0-9_. -]/g,'').slice(0,120); throw new Error(`analytics_admin_${response.status}${reason ? '_' + reason : ''}`); }
  const properties = (data.accountSummaries || []).flatMap((a: any) =>
    (a.propertySummaries || []).map((p: any) => ({ id: String(p.property || '').replace('properties/', ''), name: String(p.displayName || '') }))
  ).filter((p: any) => p.id);
  return properties;
}
async function gaStreamMatches(token: string, propertyId: string): Promise<boolean | null> {
  const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/properties/' + propertyId + '/dataStreams?pageSize=200', {
    headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000)
  });
  // The existing Analytics report remains available if the Admin API grant is absent.
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('analytics_admin_' + response.status);
  const data = await response.json();
  return (data.dataStreams || []).some((stream: any) =>
    stream.webStreamData?.measurementId === MCHURCH_MEASUREMENT_ID);
}
async function discoverGaProperty(token: string, currentPropertyId = '') {
  const properties = await gaProperties(token);
  for (const property of properties) {
    if (property.id === currentPropertyId) continue;
    if (await gaStreamMatches(token, property.id) === true) return property;
  }
  if (currentPropertyId) throw new Error('ga4_measurement_id_not_found');
  if (properties.length === 1) return properties[0];
  const matches = properties.filter((p: any) => /m\+|大雅|mchurch/i.test(p.name));
  if (matches.length === 1) return matches[0];
  throw new Error(properties.length ? 'ga4_property_selection_required' : 'ga4_property_not_found');
}
async function getWebsite(token: string, propertyId: string, start: string, end: string) {
  if (!/^\d+$/.test(propertyId)) throw new Error('ga4_property_invalid');
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: 'date' }], metrics: [
      { name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }
    ], orderBys: [{ dimension: { dimensionName: 'date' } }] }), signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`analytics_data_${response.status}`);
  return websiteSeries(data);
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
  for (const metric of data.data || []) { const value = metric.values?.[0]?.value ?? metric.total_value?.value; if (value !== undefined && value !== null && Number.isFinite(Number(value))) result[String(metric.name)] = Number(value); }
  if (!Object.keys(result).length) throw new Error('instagram_no_reported_data');
  return result;
}
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const secret = req.headers.get('x-cron-secret') || '';
    const validation = await db.rpc('pastoral_validate_care_cron_secret', { p_secret: secret });
    if (validation.error || validation.data !== true) return json({ error: 'unauthorized' }, 401);
    const options = await req.json().catch(() => ({}));
    if (options.action && options.action !== 'refresh') return json({ error: 'invalid_action' }, 400);
    // refresh repairs existing reports silently; it never creates or sends notifications.
    const refreshOnly = options.action === 'refresh';
    const settingsResult = await db.from('traffic_reporting_settings').select('*').eq('church_id', 'M+').eq('enabled', true).maybeSingle();
    if (settingsResult.error) throw settingsResult.error;
    const settings = settingsResult.data;
    if (!settings) return json({ skipped: true, reason: 'disabled' });
    const date = taipeiDate(), start = shiftDate(date, -13), repairStart = shiftDate(date, -6);
    let gaPropertyId = settings.ga4_property_id;
    let websiteDays: any = {}, youtubeDays: any = {}, websiteError = '', youtubeError = '';
    const instagramTask = getInstagram(date).then(data => ({ data, status: 'ok' })).catch(error => ({ data: {}, status: errorCode(error) }));
    try {
      const google = await googleToken();
      const websiteTask = (async () => {
        const streamMatches = gaPropertyId ? await gaStreamMatches(google.token, gaPropertyId) : false;
        if (!gaPropertyId || streamMatches === false) {
          const property = await discoverGaProperty(google.token, gaPropertyId || '');
          gaPropertyId = property.id;
          const result = await db.from('traffic_reporting_settings').update({ ga4_property_id: gaPropertyId, updated_at: new Date().toISOString() }).eq('church_id', 'M+');
          if (result.error) throw result.error;
        }
        return getWebsite(google.token, gaPropertyId, start, date);
      })();
      const [w, y] = await Promise.allSettled([websiteTask, getYoutube(google.token, start, date)]);
      if (w.status === 'fulfilled') websiteDays = w.value; else websiteError = errorCode(w.reason);
      if (y.status === 'fulfilled') youtubeDays = y.value; else youtubeError = errorCode(y.reason);
    } catch (error) { websiteError = youtubeError = errorCode(error); }
    const ig = await instagramTask;
    const meta = await db.from('traffic_reporting_settings').update({ meta_insights_status: ig.status === 'ok' ? 'connected' : ig.status.includes('authorization') ? 'authorization_required' : 'error', updated_at: new Date().toISOString() }).eq('church_id', 'M+');
    if (meta.error) throw meta.error;
    const past = await db.from('daily_traffic_reports').select('*').eq('church_id', 'M+').gte('report_date', repairStart).lte('report_date', date);
    if (past.error) throw past.error;
    const existing = new Map((past.data || []).map(row => [row.report_date, row]));
    const notifications = await db.from('app_notifications').select('id,source_key').eq('user_id', settings.recipient_user_id).eq('event_key', 'daily_traffic_report').eq('church_id', 'M+').in('source_key', Array.from({length:7}, (_,i) => 'daily-traffic-report:' + shiftDate(date, -i)));
    if (notifications.error) throw notifications.error;
    const noticeByKey = new Map((notifications.data || []).map(row => [row.source_key, row.id]));
    let updated = 0, notificationUpdates = 0, reportId = '', currentStatus: any = {}, pushSent = false;
    for (let i = 6; i >= 0; i--) {
      const day = shiftDate(date, -i), old: any = existing.get(day);
      if (!old && (day !== date || refreshOnly)) continue;
      const w = snapshot(websiteDays, day, date, 'website', websiteError), y = snapshot(youtubeDays, day, date, 'youtube', youtubeError);
      // Keep the last valid stored measurement during an upstream outage.
      const website = websiteError && old ? old.website : { ...w.metrics, property_id: gaPropertyId };
      const youtube = youtubeError && old ? old.youtube : y.metrics;
      const instagram = day === date && ig.status === 'ok' ? ig.data : old?.instagram || {};
      const status = { ...(old?.source_status || {}), website: w.status, youtube: y.status, instagram: day === date ? ig.status : old?.source_status?.instagram || 'pending', facebook: 'authorization_required' };
      const report = await db.from('daily_traffic_reports').upsert({ church_id: 'M+', report_date: day, website, youtube, instagram, facebook: old?.facebook || {}, source_status: status, generated_at: new Date().toISOString() }, { onConflict: 'church_id,report_date' }).select('id').single();
      if (report.error) throw report.error;
      updated++;
      const sourceKey = 'daily-traffic-report:' + day, body = message(day, website, youtube, instagram, status);
      const noticeId = noticeByKey.get(sourceKey);
      if (noticeId) {
        const result = await db.from('app_notifications').update({ body }).eq('id', noticeId).eq('user_id', settings.recipient_user_id).eq('event_key', 'daily_traffic_report');
        if (result.error) throw result.error;
        notificationUpdates++;
      } else if (day === date && !refreshOnly) {
        const result = await db.from('app_notifications').insert({ user_id: settings.recipient_user_id, church_id: 'M+', event_key: 'daily_traffic_report', source_key: sourceKey, title: '網站與社群每日流量報告', body, target_url: '/admin-dashboard.html' }).select('id').single();
        if (result.error && result.error.code !== '23505') throw result.error;
        // Only the process that created the new notification sends a push.
        if (!result.error) {
          const response = await fetch(SUPABASE_URL + '/functions/v1/app-push-delivery', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ user_id: settings.recipient_user_id, title: '📊 M+ 每日數位牧養報告', body, url: '/admin-dashboard.html', tag: 'daily-traffic-' + day }), signal: AbortSignal.timeout(30000) });
          pushSent = response.ok;
          if (!response.ok) console.error('push_delivery_' + response.status);
        }
      }
      if (day === date) { reportId = report.data.id; currentStatus = status; }
    }
    return json({ ok: true, date, report_id: reportId, source_status: currentStatus, updated_reports: updated, updated_notifications: notificationUpdates, push_sent: pushSent });
  } catch (error) {
    console.error('traffic_report_failed', errorCode(error));
    return json({ error: errorCode(error) }, 500);
  }
});
