// Aggregated diagnostics only. Caller must pass the existing cron authentication.
export async function diagnostics(token: string, propertyId: string, end: string) {
  const start = new Date(end + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - 13);
  const auth = { authorization: 'Bearer ' + token };
  async function read(url: string, body?: unknown) {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { ...auth, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) return { error: 'upstream_' + response.status, status: data.error?.status, reason: data.error?.details?.map((d: any) => d.reason).filter(Boolean) };
    return data;
  }
  const base = 'https://analyticsadmin.googleapis.com/v1beta/properties/' + encodeURIComponent(propertyId);
  const [property, streams, daily, youtube, realtime] = await Promise.all([
    read(base), read(base + '/dataStreams'),
    read('https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(propertyId) + ':runReport', { dateRanges: [{ startDate: start.toISOString().slice(0, 10), endDate: end }], dimensions: [{ name: 'date' }, { name: 'hostName' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }] }),
    read('https://youtubeanalytics.googleapis.com/v2/reports?' + new URLSearchParams({ ids: 'channel==MINE', startDate: start.toISOString().slice(0, 10), endDate: end, dimensions: 'day', metrics: 'views,estimatedMinutesWatched', sort: 'day' })),
    read('https://analyticsdata.googleapis.com/v1beta/properties/' + encodeURIComponent(propertyId) + ':runRealtimeReport', { metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }] })
  ]);
  return { property: { id: propertyId, name: property.displayName, timezone: property.timeZone, error: property.error, reason: property.reason }, streams: streams.dataStreams?.map((s: any) => ({ name: s.displayName, type: s.type, measurement_id: s.webStreamData?.measurementId, default_uri: s.webStreamData?.defaultUri })) || streams, website: daily, youtube, realtime };
}
