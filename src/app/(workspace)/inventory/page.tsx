import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocationSummaries } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { LocationCards } from '@/components/location-cards';
import Link from 'next/link';
export default async function Inventory() {
  const profile = await requireProfile();
  const locale = await getLocale(),
    t = dictionary(locale),
    locations = await getLocationSummaries();
  return (
    <div className="page">
      <PageHeader title={t.inventory} description={t.inventoryIntro} locale={locale} />
      {['OWNER', 'MANAGER'].includes(profile.role) && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link className="rounded-xl border p-3" href="/inventory/items">
            {t.addItem}
          </Link>
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
      )}
      <div className="mb-5">
        <h2 className="section-title">{t.chooseLocation}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.chooseLocationHint}</p>
      </div>
      <LocationCards locations={locations} locale={locale} />
    </div>
  );
}
