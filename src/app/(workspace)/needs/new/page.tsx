import { supabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { needCatalog } from '@/lib/item-catalog';
import { NeedForm } from '@/components/need-form';
import { PageHeader } from '@/components/page-header';
export default async function NewNeed({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; location?: string }>;
}) {
  const p = await requireProfile();
  if (!['OWNER', 'MANAGER'].includes(p.role)) redirect('/inventory');
  const locale = await getLocale(),
    t = dictionary(locale);
  const catalog = await needCatalog(),
    q = await searchParams;
  const product = catalog.products.find((x) => x.id === q.product && x.active);
  const suggestion = product ? { name: product.name, product_id: product.id } : undefined;
  if (suggestion) {
    const { data, error } = await (
      await supabase()
    )
      .from('purchase_needs')
      .select('id')
      .eq('product_id', product!.id)
      .eq('archived', false)
      .in('status', ['PENDING', 'ORDERED'])
      .limit(1);
    if (error) throw new Error('DATA_LOAD_FAILED');
    if (data?.[0]) redirect(`/needs/${data[0].id}`);
  }
  return (
    <div className="page">
      <PageHeader title={t.needNew} locale={locale} back="/needs" />
      <NeedForm
        locale={locale}
        catalog={catalog}
        suggestion={suggestion}
        id={crypto.randomUUID()}
        requestId={crypto.randomUUID()}
      />
    </div>
  );
}
