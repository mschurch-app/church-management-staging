export function assistantChurch(staff, preferred) {
  if (!staff || !['pastor', 'secretary', 'admin'].includes(staff.role)) throw new Error('帳號尚未獲授權使用牧師幕僚工作台。');
  const churches = [...new Set((staff.churches || []).filter(church => ['M+', 'SHiNE'].includes(church)))];
  if (preferred && !churches.includes(preferred)) throw new Error('沒有此堂會的牧師幕僚權限。');
  if (!churches.length) throw new Error('帳號尚未獲授權使用牧師幕僚工作台。');
  return preferred || churches[0];
}

export function buildAppointmentDraft({summary, date, time, duration, location, church}) {
  summary = String(summary || '').trim();
  location = String(location || '').trim();
  if (!summary || summary.length > 200 || location.length > 500) throw new Error('請檢查行程名稱與地點。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('請填寫完整日期與時間。');
  if (!['M+', 'SHiNE'].includes(church)) throw new Error('堂會範圍不正確。');
  const start = new Date(`${date}T${time}:00+08:00`);
  const localDate = new Date(start.getTime() + 8 * 3600000);
  if (!Number.isFinite(start.getTime()) || localDate.toISOString().slice(0, 16) !== `${date}T${time}`) throw new Error('日期或時間不正確。');
  const minutes = Number(duration);
  if (![30, 60, 90, 120].includes(minutes)) throw new Error('請選擇有效的會面時長。');
  const end = new Date(localDate.getTime() + minutes * 60000).toISOString();
  return `${church === 'M+' ? 'M＋大雅教會' : '火樂教會'}｜待確認行程\n行程：${summary}\n開始：${date} ${time}\n結束：${end.slice(0, 10)} ${end.slice(11, 16)}\n時區：台灣時間（Asia/Taipei）\n地點：${location || '待確認'}\n\n請確認空檔、安息日與交通緩衝後再建立行程。`;
}
