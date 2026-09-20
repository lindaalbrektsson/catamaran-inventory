import { notFound } from 'next/navigation';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
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
      {destinations.length ? (
        <Card className="shadow-none">
          <CardContent className="p-5">
            <TransferForm
              locale={locale}
              productId={productId}
              sourceId={locationId}
              source={{ ...location, quantity: Number(item.quantity) }}
              unit={t[item.product.unit]}
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
