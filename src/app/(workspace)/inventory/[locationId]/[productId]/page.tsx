import { CheckCircle2 } from 'lucide-react';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocation, getItem, getHistory } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import { ProductOverview } from '@/components/product-overview';
import { MovementHistory } from '@/components/movement-history';
export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string; productId: string }>;
  searchParams: Promise<{ saved?: string; transferred?: string; page?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const { locationId, productId } = await params,
    search = await searchParams;
  const page = /^[1-9]\d{0,4}$/.test(search.page ?? '') ? Number(search.page) : 1;
  const [location, item, history] = await Promise.all([
    getLocation(locationId),
    getItem(locationId, productId, profile.role === 'OWNER'),
    getHistory(locationId, productId, page),
  ]);
  const basePath = `/inventory/${locationId}/${productId}`;
  return (
    <div className="page">
      <PageHeader
        title={item.product.name}
        description={`${location.name} · ${locale === 'es' ? item.category.name_es : item.category.name_en}`}
        back={`/inventory/${locationId}`}
        locale={locale}
      />
      {(search.saved === '1' || search.transferred === '1') && (
        <p
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm text-primary"
        >
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          {search.transferred === '1' ? t.transferSaved : t.saved}
        </p>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <ProductOverview item={item} role={profile.role} locale={locale} basePath={basePath} />
        <MovementHistory
          {...history}
          itemName={item.product.name}
          locationName={location.name}
          viewer={profile}
          locale={locale}
          page={page}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
