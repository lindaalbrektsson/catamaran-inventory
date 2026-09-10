import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { LocationCards } from '@/components/location-cards';
import { ReceiptActions } from '@/components/receipt-actions';
import { can } from '@/lib/domain';
export default async function Home() {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <h1 className="mb-6 text-2xl font-semibold">{t.brand}</h1>
      <LocationCards
        locations={await getLocations()}
        locale={locale}
        canAdd={can(profile.role, 'inventory.add')}
      />
      {can(profile.role, 'receipts.upload') && <ReceiptActions locale={locale} />}
    </div>
  );
}
