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
import { ReceiptActions } from '@/components/receipt-actions';
import { InventoryList } from '@/components/inventory-list';
export default async function LocationInventory({
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
  const [location, search] = await Promise.all([getLocation(locationId), searchParams]);
  if (search.action === 'add' && ['OWNER', 'MANAGER'].includes(profile.role))
    return (
      <div className="page">
        <PageHeader
          title={`${t.addStock} · ${location.name}`}
          back={`/inventory/${locationId}`}
          locale={locale}
        />
        <QuickAdd
          catalog={await itemCatalog()}
          locale={locale}
          locationId={locationId}
          requestId={crypto.randomUUID()}
        />
      </div>
    );
  const showInactive =
    !search.action && search.inactive === '1' && ['OWNER', 'MANAGER'].includes(profile.role);
  const allItems = await getInventory(locationId, showInactive);
  const items = showInactive ? allItems.filter((i) => !i.product.active) : allItems;
  if (
    ['remove', 'transfer'].includes(search.action ?? '') &&
    ['OWNER', 'MANAGER'].includes(profile.role)
  )
    return (
      <div className="page">
        <PageHeader
          title={`${t[search.action as 'remove' | 'transfer']} · ${location.name}`}
          back="/"
          locale={locale}
        />
        <QuickMove
          items={items}
          location={location}
          destinations={(await getLocations()).filter((l) => l.id !== locationId)}
          mode={search.action as 'remove' | 'transfer'}
          locale={locale}
          role={profile.role}
        />
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        title={location.name}
        description={search.action ? t.chooseStockItem : t.inventoryIntro}
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
          {!search.action && <ReceiptActions locale={locale} />}
        </>
      )}
      {['OWNER', 'MANAGER'].includes(profile.role) && (
        <LowNeedSuggestions
          items={items.filter((i) => i.product.active)}
          location={location}
          locale={locale}
        />
      )}
      {!search.action && ['OWNER', 'MANAGER'].includes(profile.role) && (
        <div className="mb-4 flex gap-3">
          <Link
            className="inline-flex min-h-12 items-center rounded-xl border p-3"
            aria-current={!showInactive ? 'page' : undefined}
            href={`/inventory/${locationId}`}
          >
            {t.itemActive}
          </Link>
          <Link
            className="inline-flex min-h-12 items-center rounded-xl border p-3"
            aria-current={showInactive ? 'page' : undefined}
            href={`/inventory/${locationId}?inactive=1`}
          >
            {t.inactive}
          </Link>
        </div>
      )}
      <InventoryList
        items={items}
        locale={locale}
        initialLow={search.low === '1'}
        action={
          ['add', 'remove', 'transfer'].includes(search.action ?? '') &&
          ['OWNER', 'MANAGER'].includes(profile.role)
            ? (search.action as 'add' | 'remove' | 'transfer')
            : undefined
        }
      />
    </div>
  );
}
