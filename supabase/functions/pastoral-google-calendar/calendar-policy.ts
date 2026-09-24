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
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Sunday remains closed
export const DEFAULT_WORK_START = '09:00';
export const DEFAULT_WORK_END = '17:00';
export const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

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

export type SchedulePreferences = {
  restDays?: number[];
  workStart?: string;
  workEnd?: string;
  allowEmergencyOverride?: boolean;
};

function clockMinutes(value: string) {
  const match = /^([0-9]{2}):([0-9]{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : Number.NaN;
}

export function scheduleError(
  start: number,
  end: number,
  emergency: boolean,
  preferences: SchedulePreferences = {},
  now = Date.now(),
): 'meeting_in_past' | 'rest_day' | 'outside_schedule' | 'emergency_not_allowed' | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 'outside_schedule';
  }
  if (start <= now) return 'meeting_in_past';

  const restDays = preferences.restDays ?? [];
  const workStart = clockMinutes(preferences.workStart ?? DEFAULT_WORK_START);
  const workEnd = clockMinutes(preferences.workEnd ?? DEFAULT_WORK_END);
  if (
    !Array.isArray(restDays) ||
    restDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    !Number.isFinite(workStart) ||
    !Number.isFinite(workEnd) ||
    workStart >= workEnd
  ) return 'outside_schedule';

  const from = taipeiParts(start);
  const to = taipeiParts(end);
  if (restDays.includes(WEEKDAY_NUMBER[from.weekday])) {
    if (emergency && preferences.allowEmergencyOverride !== false) return null;
    return emergency ? 'emergency_not_allowed' : 'rest_day';
  }

  if (emergency && preferences.allowEmergencyOverride !== false) return null;

  if (
    !DEFAULT_WORK_DAYS.includes(WEEKDAY_NUMBER[from.weekday]) ||
    from.date !== to.date ||
    from.minutes < workStart ||
    to.minutes > workEnd
  ) {
    return 'outside_schedule';
  }
  return null;
}
