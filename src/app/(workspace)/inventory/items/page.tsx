import { DesktopOnly } from '@/components/desktop-only';
import { requireProfile, getLocale } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getItem } from '@/lib/inventory';
import type { ItemInput } from '@/lib/item-domain';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { ItemManager } from '@/components/item-manager';
export default async function Items({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; product?: string; location?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== 'OWNER') redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale),
    search = await searchParams,
    importing = !!search.import;
  if (!importing && !search.product) redirect('/add');
  const item =
    search.product && search.location
      ? await getItem(search.location, search.product, true)
      : undefined;
  const initial: ItemInput | undefined = item
    ? {
        name: item.product.name,
        category: item.product.category_id,
        unit: item.product.unit,
        location: item.location_id,
        minimum: item.minimum_stock?.toString() ?? '',
        target: item.target_stock?.toString() ?? '',
        cost: item.product.estimated_unit_cost?.toString() ?? '',
        currency: item.product.cost_currency,
        quantity: '',
        notes: item.product.description,
        active: item.product.active,
        mode: 'update',
      }
    : undefined;
  const content = (
    <div className="page">
      <h1 className="mb-5 text-2xl font-semibold">
        {importing ? t.importItems : item ? t.editItem : t.addItem}
      </h1>
      <ItemManager
        initial={initial}
        productId={item?.product_id}
        catalog={await itemCatalog()}
        locale={locale}
        importing={importing}
        requestId={crypto.randomUUID()}
      />
    </div>
  );
  return importing ? <DesktopOnly locale={locale}>{content}</DesktopOnly> : content;
}
