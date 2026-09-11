import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export function DesktopOnly({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = dictionary(locale);
  return (
    <>
      <div className="page md:hidden">
        <p className="mb-5">{t.desktopOnly}</p>
        <Link className="inline-flex min-h-12 items-center rounded-xl border p-3" href="/inventory">
          {t.backInventory}
        </Link>
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  );
}
