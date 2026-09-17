import { dictionary, type Locale } from './i18n';
import { belizeDate } from './task-domain';
export function compactDate(value: string, locale: Locale) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    timeZone: dateOnly ? 'UTC' : 'America/Belize',
  }).format(new Date(dateOnly ? value + 'T12:00:00Z' : value));
}
export function relativeDue(value: string, now: Date, locale: Locale) {
  const days = Math.round(
    (Date.parse(value + 'T12:00:00Z') - Date.parse(belizeDate(now) + 'T12:00:00Z')) / 86400000,
  );
  if (days === -1) return dictionary(locale).uxOverdueDay;
  return days < 0
    ? dictionary(locale).uxOverdueDays.replace('{n}', String(-days))
    : new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}
