const MAX_LINE_TEXT = 4500;

const labels = [
  ['id', '系統編號'], ['church_id', '堂會'],
  ['name', '姓名'], ['gender', '性別'], ['age', '年齡'], ['marital', '婚姻狀況'],
  ['faith_status', '信仰階段'], ['phone', '電話'], ['line_id', 'LINE ID'],
  ['district', '居住區域'], ['growth_progress', '聚會近況'], ['group_name', '所屬小組／小家'],
  ['family', '家庭資料'], ['ministry', '服事恩賜'], ['memo', '備註／牧養紀錄'],
  ['birthday', '生日'], ['baptism_date', '受洗日期'], ['photo_url', '照片連結'],
  ['know_us_from', '認識教會管道'], ['desired_feelings', '期待感受'], ['interest_tags', '生活興趣'],
];

function valueText(value) {
  if (Array.isArray(value)) return value.length ? value.join('、') : '未填寫';
  if (value === null || value === undefined || value === '') return '未填寫';
  return String(value);
}

function messagesFor(member) {
  const lines = ['M+ 有新朋友登記，請同工持續關心：' + valueText(member.name)];
  for (const [key, label] of labels) lines.push(`${label}：${valueText(member[key])}`);
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_LINE_TEXT && current) {
      chunks.push(current);
      current = line;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 5).map(text => ({ type: 'text', text }));
}

export async function notifyMplusNewcomer({ db, memberId, fetcher = fetch, token = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') || Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '', groupId = '' }) {
  const key = `mplus_newcomer_group:${memberId}`;
  const record = async (status, errorCode = null) => db.from('pastoral_notification_deliveries').upsert({
    entity_key: 'mplus', notification_type: 'newcomer_group_created', recipient_staff_id: null,
    related_id: String(memberId), idempotency_key: key, status, error_code: errorCode,
    sent_at: status === 'sent' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }, { onConflict: 'idempotency_key' });

  const previous = await db.from('pastoral_notification_deliveries').select('status').eq('idempotency_key', key).maybeSingle();
  if (!previous.error && previous.data?.status === 'sent') return { status: 'sent', duplicate: true };
  let targetGroupId = groupId || Deno.env.get('LINE_MPLUS_YOUTH_GROUP_ID') || '';
  if (!targetGroupId) {
    const configured = await db.rpc('get_weekly_service_line_group_id');
    if (!configured.error && typeof configured.data === 'string' && /^C[0-9a-f]{32}$/i.test(configured.data)) targetGroupId = configured.data;
  }
  if (!token || !targetGroupId) {
    await record('not_configured', !token ? 'line_channel_token_missing' : 'mplus_youth_group_id_missing');
    return { status: 'not_configured' };
  }

  const found = await db.from('members').select('id,church_id,register_date,photo,name,gender,age,marital,faith_status,source,phone,line_id,district,growth_progress,group_name,family,ministry,memo,created_at,birthday,baptism_date,photo_url,age_group,know_us_from,desired_feelings,interest_tags,welcome_status,archived_at,archived_by')
    .eq('id', memberId).eq('church_id', 'M+').maybeSingle();
  if (found.error || !found.data || found.data.faith_status !== '新朋友（初次聚會）' || found.data.archived_at) {
    await record('failed', 'mplus_newcomer_not_found');
    return { status: 'failed' };
  }

  if (typeof found.data.photo_url === 'string' && found.data.photo_url.startsWith('M+/')) {
    const photo = await db.storage.from('newcomer-photos').createSignedUrl(found.data.photo_url, 3600);
    found.data.photo_url = photo.error ? '照片連結無法產生' : photo.data.signedUrl;
  }

  const result = await fetcher('https://api.line.me/v2/bot/message/push', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: targetGroupId, messages: messagesFor(found.data) }),
  });
  if (!result.ok) {
    await record('failed', `line_http_${result.status}`);
    return { status: 'failed' };
  }
  await record('sent');
  return { status: 'sent' };
}
