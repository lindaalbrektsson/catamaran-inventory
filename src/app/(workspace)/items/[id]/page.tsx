import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { notFound } from 'next/navigation';
import { requireProfile, getLocale } from '@/lib/auth';
import { itemCatalog } from '@/lib/item-catalog';
import { dictionary } from '@/lib/i18n';
import { GlobalItemEditor } from '@/components/global-items';
import { PageHeader } from '@/components/page-header';
export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const db = await supabase();
  const [{ id }, locale, base, balances] = await Promise.all([
    params,
    getLocale(),
    itemCatalog(),
    collect((a, b) =>
      db
        .from('inventory_balances')
        .select('*')
        .order('product_id')
        .order('location_id')
        .range(a, b),
    ),
  ]);
  const catalog = { ...base, balances };
  const item = catalog.products.find((p) => p.id === id && p.active);
  if (!item) notFound();
  return (
    <div className="page max-w-xl">
      <PageHeader title={dictionary(locale).editItem} locale={locale} />
      <GlobalItemEditor catalog={catalog} locale={locale} item={item} />
    </div>
  );
}
