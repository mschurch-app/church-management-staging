import {websiteHostFilter} from '../daily-traffic-report/website-hosts.mjs';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import { diagnostics } from './diagnostics.ts';
import { shiftDate, youtubeSeries } from '../daily-traffic-report/report.mjs';
const errorCode = (error: unknown) => { const code = String((error as Error)?.message || 'upstream_failed'); return /^(google|youtube|analytics|ga4|invalid|website|instagram|upstream)_[A-Za-z0-9_]+$/.test(code) ? code : 'upstream_failed'; };
const E = new TextEncoder(), U = Deno.env.get('SUPABASE_URL') || '', K = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const CID = Deno.env.get('YOUTUBE_OAUTH_CLIENT_ID') || '', CS = Deno.env.get('YOUTUBE_OAUTH_CLIENT_SECRET') || '';
const db = createClient(U, K, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const ub = (v: string) => Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - v.length % 4) % 4)), x => x.charCodeAt(0));
async function dec(c: string, i: string, salt: string) {
  const digest = await crypto.subtle.digest('SHA-256', E.encode(K + salt));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(i) }, key, ub(c)));
}
async function read(url: string | URL, token?: string, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error('upstream_' + response.status);
  return data;
}
async function googleToken() {
  const row = await db.from('youtube_oauth_connections').select('refresh_token_ciphertext,refresh_token_iv').eq('church_id', 'M+').eq('status', 'connected').single();
  if (row.error || !row.data) throw new Error('google_not_connected');
  const refresh = await dec(row.data.refresh_token_ciphertext, row.data.refresh_token_iv, ':youtube-oauth-token:v1');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CID, client_secret: CS, refresh_token: refresh, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('google_token_refresh_failed');
  return String(data.access_token);
}
async function instagramToken() {
  const row = await db.from('instagram_publishing_connections').select('instagram_user_id,access_token_ciphertext,access_token_iv').eq('church_id', 'M+').eq('status', 'connected').single();
  if (row.error || !row.data) throw new Error('instagram_not_connected');
  return { id: row.data.instagram_user_id, token: await dec(row.data.access_token_ciphertext, row.data.access_token_iv, ':instagram-publishing:v1') };
}
async function ga(token: string, property: string, start: string, end: string) {
  if (!/^\d+$/.test(property)) throw new Error('ga4_property_missing');
  const data = await read('https://analyticsdata.googleapis.com/v1beta/properties/' + property + ':runReport', token, { dimensionFilter: websiteHostFilter(), dateRanges: [{ startDate: start, endDate: end }], metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews'].map(name => ({ name })) });
  const values = data.rows?.[0]?.metricValues;
  if (!values) return { status: 'awaiting_data', active_users: null, new_users: null, sessions: null, page_views: null, provisional: true };
  if (!Array.isArray(values) || values.length !== 4 || values.some((x: any) => x.value == null || x.value === '' || !Number.isFinite(Number(x.value)) || Number(x.value) < 0)) throw new Error('invalid_website_metrics');
  return { status: 'ok', active_users: Number(values[0].value), new_users: Number(values[1].value), sessions: Number(values[2].value), page_views: Number(values[3].value), provisional: true };
}
async function yt(token: string, start: string, end: string) {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.search = new URLSearchParams({ ids: 'channel==MINE', startDate: start, endDate: end, dimensions: 'day', metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost', sort: 'day' }).toString();
  const days = youtubeSeries(await read(url, token)), dates = Object.keys(days).sort();
  if (!dates.length) return { status: 'awaiting_data', views: null, watch_minutes: null, data_through: null };
  const sum = (key: string) => Object.values(days).reduce((total: number, row: any) => total + row[key], 0);
  return { status: 'ok', views: sum('views'), watch_minutes: sum('estimated_minutes_watched'), subscribers_gained: sum('subscribers_gained'), subscribers_lost: sum('subscribers_lost'), data_through: dates.at(-1), provisional: dates.at(-1) !== end };
}
async function ins(start: string, end: string) {
  const { id, token } = await instagramToken(), url = new URL('https://graph.instagram.com/v24.0/' + id + '/insights');
  url.search = new URLSearchParams({ metric: 'views,reach,total_interactions', period: 'day', since: String(Date.parse(start + 'T00:00:00+08:00') / 1000), until: String(Date.parse(end + 'T00:00:00+08:00') / 1000 + 86400), access_token: token }).toString();
  const data = await read(url), result: Record<string, unknown> = { status: 'ok' };
  for (const metric of data.data || []) {
    const values = metric.values?.map((x: any) => x.value) ?? (metric.total_value?.value != null ? [metric.total_value.value] : []);
    if (values.length && values.every((x: any) => x != null && x !== '' && Number.isFinite(Number(x)))) result[metric.name] = values.reduce((total: number, value: any) => total + Number(value), 0);
  }
  if (Object.keys(result).length === 1) return { status: 'awaiting_data' };
  return result;
}
Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const validation = await db.rpc('pastoral_validate_care_cron_secret', { p_secret: req.headers.get('x-cron-secret') || '' });
    if (validation.error || validation.data !== true) return json({ error: 'unauthorized' }, 401);
    const options = await req.json().catch(() => ({}));
    if (options.action && options.action !== 'diagnostics') return json({ error: 'invalid_action' }, 400);
    const settings = await db.from('traffic_reporting_settings').select('ga4_property_id').eq('church_id', 'M+').single();
    if (settings.error) throw settings.error;
    const token = await googleToken();
    const end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (options.action === 'diagnostics') return json(await diagnostics(token, settings.data.ga4_property_id, end));
    const out: any = { generated_at: new Date().toISOString(), facebook: { status: 'authorization_required' } };
    for (const days of [7, 30]) {
      const start = shiftDate(end, -days + 1);
      const [w, y, i] = await Promise.allSettled([ga(token, settings.data.ga4_property_id || '', start, end), yt(token, start, end), ins(start, end)]);
      const value = (result: PromiseSettledResult<any>) => result.status === 'fulfilled' ? result.value : { status: 'error', error: errorCode(result.reason) };
      out['last_' + days + '_days'] = { period: { start, end }, website: value(w), youtube: value(y), instagram: value(i) };
    }
    return json(out);
  } catch (error) { return json({ error: errorCode(error) }, 500); }
});
