import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary, number } from '@/lib/i18n';
import { getLocation, getItem, getTransferDestinations } from '@/lib/inventory';
import { can } from '@/lib/domain';
import { PageHeader } from '@/components/page-header';
import { TransferForm } from '@/components/transfer-form';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';

export default async function Transfer({
  params,
}: {
  params: Promise<{ locationId: string; productId: string }>;
}) {
  const profile = await requireProfile();
  if (!can(profile.role, 'inventory.transfer')) notFound();
  const locale = await getLocale(),
    t = dictionary(locale);
  const { locationId, productId } = await params;
  const [location, item, destinations] = await Promise.all([
    getLocation(locationId),
    getItem(locationId, productId),
    getTransferDestinations(productId, locationId),
  ]);
  return (
    <div className="page max-w-2xl">
      <PageHeader
        title={t.transferStock}
        description={`${item.product.name} · ${location.name}`}
        back={`/inventory/${locationId}/${productId}`}
        locale={locale}
      />
      <div className="mb-6 rounded-xl bg-secondary p-4 text-primary">
        <p className="text-sm">
          {t.source}: {location.name}
        </p>
        <p className="mt-2 font-semibold">
          {t.currentStock}: {number(item.quantity, locale)} {t[item.product.unit]}
        </p>
      </div>
      {destinations.length ? (
        <Card className="shadow-none">
          <CardContent className="p-5">
            <TransferForm
              locale={locale}
              productId={productId}
              sourceId={locationId}
              destinations={destinations}
              requestId={crypto.randomUUID()}
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState title={t.noDestinations} hint={t.noDestinationsHint} />
      )}
    </div>
  );
}
