// XP is derived from saved, unique reading dates; it is never a gift balance.
export const LEVELS = Object.freeze([
  { level: 1, xp: 0, name: '種子與新芽', art: 'sapling' },
  { level: 2, xp: 100, name: '嫩葉', art: 'sapling' },
  { level: 3, xp: 250, name: '小樹', art: 'tree' },
  { level: 4, xp: 500, name: '枝葉舒展', art: 'tree' },
  { level: 5, xp: 900, name: '初花', art: 'bloom' },
  { level: 6, xp: 1500, name: '祝福果實', art: 'bloom' },
  { level: 7, xp: 2400, name: '生命之光', art: 'bloom' },
]);
const DAY = 86400000;
const ordinal = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date / DAY : null;
};
export function dateAtOffset(date, offset) {
  const day = ordinal(date);
  if (day === null) throw new TypeError('日期格式不正確');
  return new Date((day + offset) * DAY).toISOString().slice(0, 10);
}
export function levelForXP(value) {
  const xp = Math.max(0, Math.floor(Number(value) || 0));
  const index = LEVELS.findLastIndex(item => xp >= item.xp);
  const current = LEVELS[Math.max(0, index)], next = LEVELS[index + 1] || null;
  return { xp, current, next, remaining: next ? next.xp - xp : 0,
    fraction: next ? (xp - current.xp) / (next.xp - current.xp) : 1 };
}
export function readingProgress({ records = [], notes = [], battles = [], startDate, today }) {
  const first = ordinal(startDate), last = ordinal(today), dates = new Map();
  for (const record of records) {
    const day = ordinal(record.reading_date);
    if (first === null || last === null || day === null || day < first || day > last) continue;
    if (!['on_time', 'makeup'].includes(record.completion_type)) continue;
    const previous = dates.get(record.reading_date);
    dates.set(record.reading_date, { ...record,
      completion_type: previous?.completion_type === 'on_time' ? 'on_time' : record.completion_type,
      watered_at: record.watered_at || previous?.watered_at || null });
  }
  const noteDates = new Set(notes.filter(note => dates.has(note.reading_date) && String(note.note || '').trim()).map(note => note.reading_date));
  const weeks = new Map();
  for (const date of dates.keys()) {
    const week = Math.floor((ordinal(date) - first) / 7);
    weeks.set(week, (weeks.get(week) || 0) + 1);
  }
  const battleDates = new Map();
  for (const battle of battles) {
    const date = typeof battle === 'string' ? battle : battle?.reading_date;
    const value = ordinal(date);
    if (value === null || first === null || last === null || value < first || value > last) continue;
    // Normal encounter 10 XP, rare boss encounter 30 XP. At most one award/date.
    const award = typeof battle === 'object' && battle?.kind === 'boss' ? 30 : 10;
    battleDates.set(date, Math.max(battleDates.get(date) || 0, award));
  }
  const breakdown = { battle: [...battleDates.values()].reduce((sum, n) => sum + n, 0), reading: dates.size * 20, water: [...dates.values()].filter(r => r.watered_at).length * 5,
    journal: noteDates.size * 5, weekly: [...weeks.values()].filter(count => count >= 5).length * 30 };
  let day = dates.get(today)?.completion_type === 'on_time' ? today : dateAtOffset(today, -1), streak = 0;
  while (dates.get(day)?.completion_type === 'on_time') { streak++; day = dateAtOffset(day, -1); }
  return { ...levelForXP(Object.values(breakdown).reduce((sum, n) => sum + n, 0)),
    days: dates.size, streak, breakdown, todayRecord: dates.get(today), todayNote: noteDates.has(today) };
}
