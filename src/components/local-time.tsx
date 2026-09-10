'use client';
import { useSyncExternalStore } from 'react';
import type { Locale } from '@/lib/i18n';
const subscribe = () => () => {};
export function LocalTime({ value, locale }: { value: string; locale: Locale }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      new Intl.DateTimeFormat(locale === 'es' ? 'es-BZ' : 'en-BZ', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)),
    () => new Date(value).toISOString(),
  );
  return <time dateTime={value}>{text}</time>;
}
