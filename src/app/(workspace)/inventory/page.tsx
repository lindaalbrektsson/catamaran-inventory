import Link from 'next/link';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { LocationCards } from '@/components/location-cards';
import { InventoryAdminActions } from '@/components/inventory-admin-actions';
export default async function Inventory() {
  const profile = await requireProfile();
  const locale = await getLocale(),
    t = dictionary(locale),
    locations = await getLocations();
  return (
    <div className="page">
      <PageHeader title={t.inventory} description={t.inventoryIntro} locale={locale} />
      {['OWNER', 'MANAGER'].includes(profile.role) && (
        <Link
          href="/needs"
          className="mb-4 inline-flex min-h-12 items-center rounded-xl border px-4"
        >
          {t.needsTitle}
        </Link>
      )}
      <InventoryAdminActions role={profile.role} locale={locale} />
      <div className="mb-5">
        <h2 className="section-title">{t.chooseLocation}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.chooseLocationHint}</p>
      </div>
      <LocationCards
        locations={locations}
        locale={locale}
        canAdd={['OWNER', 'MANAGER'].includes(profile.role)}
      />
    </div>
  );
}
