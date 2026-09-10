import Link from 'next/link';
import { dictionary, type Locale } from '@/lib/i18n';
export function InventoryAdminActions({ role, locale }: { role: string; locale: Locale }) {
  if (role !== 'OWNER') return null;
  const t = dictionary(locale);
  return (
    <div className="mb-5">
      <Link
        className="inline-flex min-h-12 items-center rounded-xl border p-3"
        href="/inventory/items"
      >
        {t.addItem}
      </Link>
      <div className="mt-3 hidden flex-wrap gap-3 md:flex">
        <a className="rounded-xl border p-3" href="/inventory-excel">
          {t.downloadTemplate}
        </a>
        <Link className="rounded-xl border p-3" href="/inventory/items?import=1">
          {t.importItems}
        </Link>
        <a className="rounded-xl border p-3" href="/inventory-excel?export=1">
          {t.exportItems}
        </a>
      </div>
    </div>
  );
}
