import { DateTime } from 'luxon';

export function serverNow(timezone: string, now: Date = new Date()): DateTime {
  return DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);
}

export function localDateString(timezone: string, now = new Date()): string {
  return serverNow(timezone, now).toISODate()!;
}

export function currentWeekKey(timezone: string, now = new Date()): string {
  const local = serverNow(timezone, now);
  return local.minus({ days: local.weekday % 7 }).toISODate()!;
}
