const TAIPEI_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export const MEETING_MINUTES = [30, 60, 90, 120];
export const BUFFER_MS = 30 * 60 * 1000;

function taipeiParts(ms: number) {
  const parts = Object.fromEntries(
    TAIPEI_PARTS.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes:
      Number(parts.hour) * 60 +
      Number(parts.minute) +
      Number(parts.second) / 60,
  };
}

export function scheduleError(
  start: number,
  end: number,
  emergency: boolean,
  now = Date.now(),
): 'meeting_in_past' | 'rest_day' | 'outside_schedule' | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 'outside_schedule';
  }
  if (start <= now) return 'meeting_in_past';

  if (emergency) return null;

  const from = taipeiParts(start);
  const to = taipeiParts(end);
  if (from.weekday === 'Mon') return 'rest_day';

  if (
    !['Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(from.weekday) ||
    from.date !== to.date ||
    from.minutes < 9 * 60 ||
    to.minutes > 17 * 60
  ) {
    return 'outside_schedule';
  }
  return null;
}
