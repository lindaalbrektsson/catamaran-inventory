import { PageBack } from './app-back';
import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export function DesktopOnly({
  locale,
  children,
  back = '/inventory',
  backLabel,
}: {
  locale: Locale;
  children: React.ReactNode;
  back?: string;
  backLabel?: string;
}) {
  const t = dictionary(locale);
  return (
    <>
      <div className="page md:hidden">
        <p className="mb-5">{t.desktopOnly}</p>
        <PageBack locale={locale}>
          <Link className="inline-flex min-h-12 items-center rounded-xl border p-3" href={back}>
            {backLabel ?? t.backInventory}
          </Link>
        </PageBack>
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  );
}
