'use client';
import { useEffect, useState } from 'react';
import { dictionary, type Locale } from '@/lib/i18n';
function Waiting({ locale }: { locale: Locale }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 14000);
    return () => clearTimeout(timer);
  }, []);
  return slow ? (
    <p role="status" className="text-sm text-muted-foreground">
      {dictionary(locale).uploadTakingLonger}
    </p>
  ) : null;
}
// This timer only informs; it cannot abort, retry or change a request identity.
export function SlowOperationNotice({ pending, locale }: { pending: boolean; locale: Locale }) {
  return pending ? <Waiting locale={locale} /> : null;
}
