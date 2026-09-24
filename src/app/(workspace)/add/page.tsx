import { Suspense } from 'react';
import { CashbookAddActions } from '@/components/cashbook-entry-points';
import { AddHub } from '@/components/add-hub';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { itemCatalog } from '@/lib/item-catalog';
import { QuickAdd } from '@/components/quick-add';
export default async function Add({
  searchParams,
}: {
  searchParams: Promise<{ inventory?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale);
  if ((await searchParams).inventory !== '1')
    return (
      <div className="page">
        <h1 className="mb-5 text-2xl font-semibold">{t.add}</h1>
        <AddHub locale={locale} />
        <Suspense fallback={null}>
          <CashbookAddActions locale={locale} />
        </Suspense>
      </div>
    );
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{t.addStock}</h1>
      <QuickAdd locale={locale} catalog={await itemCatalog()} requestId={crypto.randomUUID()} />
    </div>
  );
}
