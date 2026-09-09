'use client';
import { dictionary } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale =
      typeof document !== 'undefined' && document.documentElement.lang === 'es' ? 'es' : 'en',
    t = dictionary(locale);
  return (
    <div className="page">
      <h1 className="page-title">{t.errorTitle}</h1>
      <p className="my-5 max-w-lg text-muted-foreground">{t.errorHint}</p>
      <Button onClick={reset}>{t.retry}</Button>
    </div>
  );
}
