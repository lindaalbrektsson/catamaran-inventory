import { supabase } from '@/lib/supabase/server';
import { collect } from '@/lib/inventory';
import { ListSkeleton } from '@/components/list-skeleton';
import { timed } from '@/lib/performance';
import { Suspense } from 'react';
import type { Locale } from '@/lib/i18n';
import type { InventoryItem } from '@/lib/inventory';
import type { Location } from '@/lib/database.types';
import { QuickMove } from '@/components/quick-move';
import { LowNeedSuggestions } from '@/components/low-need-suggestions';
import { getLocations } from '@/lib/inventory';
import { QuickAdd } from '@/components/quick-add';
import { itemCatalog } from '@/lib/item-catalog';
import { getLocale, requireProfile } from '@/lib/auth';
import { dictionary } from '@/lib/i18n';
import { getLocation, getInventory } from '@/lib/inventory';
import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { InventoryList } from '@/components/inventory-list';
async function renderLocationInventory({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ low?: string; action?: string; inactive?: string }>;
}) {
  const profile = await requireProfile();
  const { locationId } = await params,
    locale = await getLocale(),
    t = dictionary(locale);
  const search = await searchParams;
  if (search.action === 'add' && ['OWNER', 'MANAGER'].includes(profile.role)) {
    const [location, catalog] = await Promise.all([
      getLocation(locationId),
      timed('inventory.catalog', itemCatalog),
    ]);
    return (
      <div className="page">
        <PageHeader
          locationType={location.type}
          title={`${t.addStock} · ${location.name}`}
          back={`/inventory/${locationId}`}
          locale={locale}
        />
        <QuickAdd
          catalog={catalog}
          locale={locale}
          locationId={locationId}
          requestId={crypto.randomUUID()}
        />
      </div>
    );
  }
  const showInactive =
    !search.action && search.inactive === '1' && ['OWNER', 'MANAGER'].includes(profile.role);
  const moving =
    ['remove', 'transfer'].includes(search.action ?? '') &&
    ['OWNER', 'MANAGER'].includes(profile.role);
  const inventory = getInventory(locationId, showInactive);
  // Observe early failures while the authorized location loads. The original
  // rejection still reaches the route error boundary when its section renders.
  void inventory.catch(() => {});
  const [location, destinations, transferBalances] = await Promise.all([
    getLocation(locationId),
    moving ? getLocations() : Promise.resolve([]),
    moving && search.action === 'transfer'
      ? (async () => {
          const db = await supabase();
          return collect((a, b) =>
            db
              .from('inventory_balances')
              .select('product_id,location_id,quantity')
              .neq('location_id', locationId)
              .order('location_id')
              .order('product_id')
              .range(a, b),
          );
        })()
      : Promise.resolve([]),
  ]);
  if (
    ['remove', 'transfer'].includes(search.action ?? '') &&
    ['OWNER', 'MANAGER'].includes(profile.role)
  ) {
    const items = await inventory;
    return (
      <div className="page">
        <PageHeader
          locationType={location.type}
          title={`${t[search.action as 'remove' | 'transfer']} · ${location.name}`}
          back="/"
          locale={locale}
        />
        <QuickMove
          items={items}
          balances={transferBalances}
          location={location}
          destinations={destinations.filter((l) => l.id !== locationId)}
          mode={search.action as 'remove' | 'transfer'}
          locale={locale}
          role={profile.role}
        />
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader
        locationType={location.type}
        title={location.name}
        description={search.action ? t.chooseStockItem : undefined}
        back="/inventory"
        locale={locale}
      />
      {['OWNER', 'MANAGER'].includes(profile.role) && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {(['add', 'remove', 'transfer'] as const).map((action) => (
              <Link
                key={action}
                href={`/inventory/${locationId}?action=${action}`}
                aria-current={search.action === action ? 'page' : undefined}
                className={`flex min-h-14 items-center justify-center rounded-xl border font-medium ${search.action === action ? 'bg-primary text-primary-foreground' : ''}`}
              >
                {t[action]}
              </Link>
            ))}
          </div>
        </>
      )}
      {!search.action && ['OWNER', 'MANAGER'].includes(profile.role) && (
        <div className="mb-4 flex gap-3">
          <Link
            className="selection-control inline-flex min-h-12 items-center rounded-xl border p-3"
            aria-current={!showInactive ? 'page' : undefined}
            href={`/inventory/${locationId}`}
          >
            {t.itemActive}
          </Link>
          <Link
            className="selection-control inline-flex min-h-12 items-center rounded-xl border p-3"
            aria-current={showInactive ? 'page' : undefined}
            href={`/inventory/${locationId}?inactive=1`}
          >
            {t.inactive}
          </Link>
        </div>
      )}
      <Suspense fallback={<ListSkeleton label={t.loading} />}>
        <LocationInventoryContent
          inventory={inventory}
          location={location}
          locale={locale}
          inactive={showInactive}
          low={search.low === '1'}
          canUseNeeds={['OWNER', 'MANAGER'].includes(profile.role)}
          action={
            ['add', 'remove', 'transfer'].includes(search.action ?? '') &&
            ['OWNER', 'MANAGER'].includes(profile.role)
              ? (search.action as 'add' | 'remove' | 'transfer')
              : undefined
          }
        />
      </Suspense>
    </div>
  );
}

async function LocationInventoryContent({
  inventory,
  location,
  locale,
  inactive,
  low,
  canUseNeeds,
  action,
}: {
  inventory: Promise<InventoryItem[]>;
  location: Location;
  locale: Locale;
  inactive: boolean;
  low: boolean;
  canUseNeeds: boolean;
  action?: 'add' | 'remove' | 'transfer';
}) {
  const allItems = await inventory;
  const items = inactive ? allItems.filter((item) => !item.product.active) : allItems;
  return (
    <>
      {canUseNeeds && (
        <Suspense fallback={<ListSkeleton label={dictionary(locale).loading} rows={1} />}>
          <LowNeedSuggestions
            items={items.filter((item) => item.product.active)}
            location={location}
            locale={locale}
          />
        </Suspense>
      )}
      <InventoryList
        inactive={inactive}
        items={items}
        locale={locale}
        initialLow={low}
        action={action}
      />
    </>
  );
}

export default async function LocationInventory(
  props: Parameters<typeof renderLocationInventory>[0],
) {
  return timed('route.location', () => renderLocationInventory(props));
}
