import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { itemCatalog } from '@/lib/item-catalog';
import { QuickAdd } from '@/components/quick-add';
export default async function Add() {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale);
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{t.addStock}</h1>
      <QuickAdd locale={locale} catalog={await itemCatalog()} requestId={crypto.randomUUID()} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/needs/new" className="min-h-12 rounded-xl border p-3">
          {t.needNew}
        </Link>
        <Link href="/expenses" className="min-h-12 rounded-xl border p-3">
          {t.receipts}
        </Link>
      </div>
    </div>
  );
}
