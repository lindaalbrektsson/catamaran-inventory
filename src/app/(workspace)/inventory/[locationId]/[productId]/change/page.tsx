import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, number } from '@/lib/i18n';
import { getLocation, getItem } from '@/lib/inventory';
import { can } from '@/lib/domain';
import { PageHeader } from '@/components/page-header';
import { StockForm } from '@/components/stock-form';
import { Card, CardContent } from '@/components/ui/card';
export default async function Change({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string; productId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const profile = await requireProfile(),
    locale = await getLocale(),
    t = dictionary(locale);
  const { locationId, productId } = await params,
    { mode } = await searchParams;
  if (mode !== 'add' && mode !== 'remove') notFound();
  if (!can(profile.role, mode === 'add' ? 'inventory.add' : 'inventory.consume')) notFound();
  const [location, item] = await Promise.all([
    getLocation(locationId),
    getItem(locationId, productId),
  ]);
  return (
    <div className="page max-w-2xl">
      <PageHeader
        title={
          mode === 'add'
            ? t.addStock
            : can(profile.role, 'inventory.remove')
              ? t.removeStock
              : t.consume
        }
        description={`${item.product.name} · ${location.name}`}
        back={`/inventory/${locationId}/${productId}`}
        locale={locale}
      />
      <div className="mb-6 flex items-center justify-between rounded-xl bg-secondary p-4 text-primary">
        <span className="text-sm">{t.currentStock}</span>
        <span className="font-semibold">
          {number(item.quantity, locale)} {t[item.product.unit]}
        </span>
      </div>
      <Card className="shadow-none">
        <CardContent className="p-5 md:p-6">
          <StockForm
            locale={locale}
            productId={productId}
            locationId={locationId}
            mode={mode}
            requestId={crypto.randomUUID()}
            role={profile.role}
          />
        </CardContent>
      </Card>
    </div>
  );
}
