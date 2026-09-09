import { getLocale } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
export default async function Loading() {
  const t = dictionary(await getLocale());
  return (
    <div className="page" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{t.loading}</p>
      <div aria-hidden="true" className="mt-6 grid animate-pulse gap-4">
        <div className="h-12 w-2/3 rounded-xl bg-muted" />
        <div className="h-40 rounded-xl bg-muted" />
        <div className="h-40 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
