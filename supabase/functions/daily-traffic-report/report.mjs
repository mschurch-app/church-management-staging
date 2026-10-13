export function shiftDate(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function numbers(values, names) {
  if (!Array.isArray(values) || values.length !== names.length) throw new Error('invalid_metric_values');
  return Object.fromEntries(names.map((name, index) => {
    const raw = values[index];
    const value = typeof raw === 'number' || typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0) throw new Error('invalid_metric_values');
    return [name, value];
  }));
}

export function websiteSeries(data) {
  if (!data || !Array.isArray(data.metricHeaders) || !Array.isArray(data.dimensionHeaders)) throw new Error('invalid_website_response');
  const names = ['activeUsers', 'sessions', 'screenPageViews'];
  if (data.metricHeaders.map(x => x.name).join() !== names.join() || data.dimensionHeaders[0]?.name !== 'date') throw new Error('invalid_website_headers');
  if (data.metadata?.timeZone && data.metadata.timeZone !== 'Asia/Taipei') throw new Error('website_timezone_mismatch');
  const rows = data.rows || [];
  if (!Array.isArray(rows)) throw new Error('invalid_website_rows');
  return Object.fromEntries(rows.map(row => {
    const day = row.dimensionValues?.[0]?.value;
    if (!/^\d{8}$/.test(day)) throw new Error('invalid_website_date');
    return [day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6), numbers(row.metricValues?.map(x => x.value), ['active_users', 'sessions', 'page_views'])];
  }));
}

export function youtubeSeries(data) {
  const expected = ['day', 'views', 'estimatedMinutesWatched', 'subscribersGained', 'subscribersLost'];
  if (!data || !Array.isArray(data.columnHeaders) || data.columnHeaders.map(x => x.name).join() !== expected.join()) throw new Error('invalid_youtube_headers');
  const rows = data.rows || [];
  if (!Array.isArray(rows)) throw new Error('invalid_youtube_rows');
  return Object.fromEntries(rows.map(row => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0])) throw new Error('invalid_youtube_date');
    return [row[0], numbers(row.slice(1), ['views', 'estimated_minutes_watched', 'subscribers_gained', 'subscribers_lost'])];
  }));
}

export function snapshot(series, day, today, source, error) {
  if (error) return { status: error, metrics: {} };
  const latestDate = Object.keys(series).filter(date => date <= day).sort().at(-1);
  const latest = latestDate ? { date: latestDate, ...series[latestDate] } : null;
  const present = series[day];
  const age = (Date.parse(today) - Date.parse(day)) / 86400000;
  const status = present ? 'ok' : age <= (source === 'website' ? 2 : 3) ? 'awaiting_data' : 'no_reported_data';
  return { status, metrics: { ...(present || {}), data_date: day, ...(latest ? { latest_available: latest } : {}), provisional: present ? age <= (source === 'website' ? 2 : 3) : true } };
}

export function message(date, website, youtube, instagram, status) {
  const lines = [`${date}｜網站與社群流量`, ''];
  if (status.website === 'ok') lines.push(`🌐 網站｜${website.active_users} 位訪客・${website.page_views} 次瀏覽${website.provisional ? '（初步數據）' : ''}`);
  else {
    lines.push(status.website === 'ga4_measurement_id_not_found'
      ? '🌐 網站｜網站追蹤碼與目前可讀的 GA4 資源不一致，請檢查串流設定。'
      : ['awaiting_data', 'no_reported_data'].includes(status.website)
      ? '🌐 網站｜尚未取得當日資料，不能判定為 0 人。'
      : '🌐 網站｜暫時無法讀取統計，請檢查平台連線。');
    if (website.latest_available) lines.push(`最近有資料：${website.latest_available.date}，${website.latest_available.active_users} 位訪客・${website.latest_available.page_views} 次瀏覽。`);
  }
  if (status.youtube === 'ok') lines.push(`▶️ YouTube｜${youtube.views} 次觀看・${(youtube.estimated_minutes_watched / 60).toFixed(1)} 小時觀看${youtube.provisional ? '（初步數據）' : ''}`);
  else {
    lines.push(['awaiting_data', 'no_reported_data'].includes(status.youtube) ? '▶️ YouTube｜當日資料尚未就緒。' : '▶️ YouTube｜暫時無法讀取統計，請檢查平台連線。');
    if (youtube.latest_available) lines.push(`最近有資料：${youtube.latest_available.date}，${youtube.latest_available.views} 次觀看・${(youtube.latest_available.estimated_minutes_watched / 60).toFixed(1)} 小時觀看。`);
  }
  if (status.instagram === 'ok') {
    const parts = [];
    if (Number.isFinite(instagram.reach)) parts.push(`觸及 ${instagram.reach} 人`);
    if (Number.isFinite(instagram.total_interactions)) parts.push(`互動 ${instagram.total_interactions}`);
    else parts.push('互動資料尚未提供');
    lines.push('📱 Instagram｜' + parts.join('・'));
  } else lines.push('📱 Instagram｜洞察資料暫時無法取得。');
  lines.push('', '💡 資料說明');
  if (status.website !== 'ok') lines.push(website.latest_available && date > shiftDate(website.latest_available.date, 2) ? '網站連續多日未回傳資料，需檢查追蹤設定；不能以此認定無人造訪。' : '網站統計仍待處理；資料缺少時不以 0 代替。');
  lines.push('各平台更新時間不同；YouTube 依平台日期統計。系統每天重查最近 7 天並修正通知內容。');
  if (status.facebook !== 'ok') lines.push('Facebook 洞察尚待連結。');
  return lines.join('\n').slice(0, 1000);
}
