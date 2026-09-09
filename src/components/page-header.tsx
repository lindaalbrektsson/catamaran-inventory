import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { dictionary } from '@/lib/i18n';
export function PageHeader({
  title,
  description,
  back,
  locale,
}: {
  title: string;
  description?: string;
  back?: string;
  locale: Locale;
}) {
  const t = dictionary(locale);
  return (
    <header className="mb-7">
      {back && (
        <Link
          href={back}
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.back}
        </Link>
      )}
      <h1 className="page-title">{title}</h1>
      {description && (
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
