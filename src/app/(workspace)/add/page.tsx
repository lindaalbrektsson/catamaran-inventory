import { PackagePlus, ShoppingCart, ReceiptText, ClipboardPlus, FilePlus2 } from 'lucide-react';
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
        <div className="grid max-w-xl gap-3">
          {[
            { href: '/add?inventory=1', label: t.addStock, icon: PackagePlus },
            { href: '/needs/new', label: t.addPurchaseNeed, icon: ShoppingCart },
            { href: '/expenses/capture', label: t.addReceipt, icon: ReceiptText },
            { href: '/tasks/new', label: t.taskAdd, icon: ClipboardPlus },
            ...(p.role === 'OWNER'
              ? [{ href: '/documents/new', label: t.addDocument, icon: FilePlus2 }]
              : []),
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 font-medium"
            >
              <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <span>{label}</span>
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
