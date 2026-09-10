import { requireProfile, getLocale } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { ItemManager } from '@/components/item-manager';
export default async function Items({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const profile = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(profile.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    importing = !!(await searchParams).import;
  return (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">{importing ? t.importItems : t.addItem}</h1>
      <ItemManager
        catalog={await itemCatalog()}
        locale={locale}
        importing={importing}
        requestId={crypto.randomUUID()}
      />
    </div>
  );
}
