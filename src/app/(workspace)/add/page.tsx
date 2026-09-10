import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocations } from '@/lib/inventory';
import { LocationCards } from '@/components/location-cards';
import { ReceiptActions } from '@/components/receipt-actions';
import { can } from '@/lib/domain';
export default async function Add() {
  const p = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{t.add}</h1>
      <LocationCards
        locations={await getLocations()}
        locale={locale}
        canAdd={can(p.role, 'inventory.add')}
      />
      {can(p.role, 'receipts.upload') && <ReceiptActions locale={locale} />}
    </div>
  );
}
