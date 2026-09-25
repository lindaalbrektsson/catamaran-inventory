import { PageBack } from './app-back';
import type { Locale } from '@/lib/i18n';
export function PageHeader({
  title,
  description,
  back,
  locale,
  locationType,
}: {
  title: string;
  description?: string;
  back?: string;
  locale: Locale;
  locationType?: string;
}) {
  return (
    <header
      data-location={locationType}
      className={`mb-7 ${locationType ? 'location-header' : ''}`}
    >
      {back && <PageBack locale={locale} />}
      <h1 className="page-title">{title}</h1>
      {description && (
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
