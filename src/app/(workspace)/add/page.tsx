import Link from 'next/link';
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
        <div className="grid max-w-xl gap-4">
          {[
            ['/add?inventory=1', t.addInventory],
            ['/expenses/capture?type=FUEL', t.addFuelReceipt],
            ['/expenses/capture?type=STORE', t.addStoreReceipt],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-20 items-center rounded-2xl border bg-card p-5 text-lg font-semibold"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    );
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{t.addStock}</h1>
      <QuickAdd locale={locale} catalog={await itemCatalog()} requestId={crypto.randomUUID()} />
    </div>
  );
}
