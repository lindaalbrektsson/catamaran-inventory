import { redirect } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { needCatalog } from '@/lib/item-catalog';
import { NeedForm } from '@/components/need-form';
import { PageHeader } from '@/components/page-header';
import { activeNeedForLocation, suggestedNeedQuantity } from '@/lib/need-matching';
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
  const location = product
    ? catalog.locations.find((l) => l.id === q.location && l.active)
    : undefined;
  const suggestion = product
    ? {
        name: product.name,
        product_id: product.id,
        location_id: location?.id,
        quantity_needed: suggestedNeedQuantity(catalog, product.id, location?.id),
      }
    : undefined;
  const existing = product ? activeNeedForLocation(catalog, product.id, location?.id) : undefined;
  if (existing) redirect(`/needs/${existing.id}`);
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
