import { MovementHistory } from '@/components/movement-history';
import { QuickMove } from '@/components/quick-move';
import { QuickAdd } from '@/components/quick-add';
import { NeedForm } from '@/components/need-form';
import { createRoot } from 'react-dom/client';
import { ReceiptReview } from '@/components/receipt-review';
import { DesktopOnly } from '@/components/desktop-only';
import { UndoStock } from '@/components/undo-stock';
import { OwnerInventory } from '@/components/owner-inventory';
import { LocalTime } from '../../src/components/local-time';
import { InventoryAdminActions } from '../../src/components/inventory-admin-actions';
import { ItemManager } from '../../src/components/item-manager';
import { ReceiptUploader } from '../../src/components/receipt-uploader';
import { InventoryList } from '../../src/components/inventory-list';
import { StockForm } from '../../src/components/stock-form';
import { TransferForm } from '../../src/components/transfer-form';
import { LocationCards } from '../../src/components/location-cards';
import { ProductOverview } from '../../src/components/product-overview';
import type { LocationSummary } from '../../src/lib/inventory';
import { Brand } from '../../src/components/brand';
import { Navigation } from '../../src/components/navigation';
import { PageHeader } from '../../src/components/page-header';
import { dictionary } from '../../src/lib/i18n';
import type { InventoryItem } from '../../src/lib/inventory';
import '../../src/app/globals.css';
const params = new URLSearchParams(location.search),
  locale = params.get('lang') === 'es' ? 'es' : 'en',
  t = dictionary(locale);
document.documentElement.lang = locale;
const item: InventoryItem = {
  product_id: '30000000-0000-4000-8000-000000000001',
  location_id: '10000000-0000-4000-8000-000000000001',
  quantity: 2,
  minimum_stock: 3,
  target_stock: 8,
  updated_at: '2026-09-09T14:00:00Z',
  product: {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Belikin Beer',
    category_id: '20000000-0000-4000-8000-000000000001',
    description: '',
    photo_path: null,
    unit: 'bottle',
    estimated_unit_cost: 3.5,
    cost_currency: 'BZD',
    active: true,
    created_at: '2026-09-09T14:00:00Z',
    updated_at: '2026-09-09T14:00:00Z',
  },
  category: {
    id: '20000000-0000-4000-8000-000000000001',
    name_en: 'Bar',
    name_es: 'Bar',
    active: true,
  },
};
const items = [
  item,
  {
    ...item,
    product_id: '30000000-0000-4000-8000-000000000002',
    quantity: 24,
    product: { ...item.product, id: '30000000-0000-4000-8000-000000000002', name: 'Water' },
  },
  {
    ...item,
    product_id: '30000000-0000-4000-8000-000000000003',
    quantity: 6,
    product: {
      ...item.product,
      id: '30000000-0000-4000-8000-000000000003',
      name: 'Paper Towels',
      category_id: '20000000-0000-4000-8000-000000000002',
      unit: 'roll' as const,
    },
    category: {
      id: '20000000-0000-4000-8000-000000000002',
      name_en: 'Boat supplies',
      name_es: 'Suministros del barco',
      active: true,
    },
  },
];
// Isolated visual fixtures only; none are sent to Supabase or the Next.js app.
const locations: LocationSummary[] = ['Cas Cat', 'Bodega'].map((name, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index === 0 ? 1 : 3}`,
  name,
  type: index === 1 ? 'STORAGE' : 'BOAT',
  active: true,
  created_at: '2026-09-09T14:00:00Z',
  activeItems: index === 1 ? 0 : 3,
  lowStockCount: index === 0 ? 1 : 0,
  latestMovement:
    index === 1 ? null : { created_at: '2026-09-09T14:00:00Z', transaction_type: 'TOUR_USE' },
}));
createRoot(document.getElementById('root')!).render(
  <div>
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-6 md:block">
      <Brand locale={locale} />
      <div className="mt-10">
        <Navigation locale={locale} />
      </div>
    </aside>
    <div className="workspace-content md:ml-64">
      <header className="flex h-20 items-center border-b bg-card px-5">
        <Brand locale={locale} />
      </header>
      <main className="page">
        <PageHeader
          title={params.has('form') ? t.removeStock : 'Cas Cat'}
          description={t.inventoryIntro}
          locale={locale}
        />
        {params.get('view') === 'history' ? (
          <MovementHistory
            itemName="Water"
            locationName="Bodega"
            locale={locale}
            page={1}
            hasNext={false}
            basePath="/inventory/fixture"
            viewer={{ id: 'owner', role: 'OWNER' }}
            movements={[
              {
                id: '50000000-0000-4000-8000-000000000001',
                request_id: '50000000-0000-4000-8000-000000000002',
                product_id: item.product_id,
                location_id: item.location_id,
                transaction_type: 'ADD',
                quantity: 2,
                previous_quantity: 0,
                resulting_quantity: 2,
                reason: 'other',
                notes: 'QUICK_ADD',
                performed_by_user_id: 'owner',
                created_at: '2026-09-11T12:23:00Z',
                actor: 'Linda',
                transfer_id: null,
                related_location_id: null,
              },
            ]}
          />
        ) : params.get('view') === 'quick-move' ? (
          <QuickMove
            items={items}
            location={locations[0]}
            destinations={[locations[1]]}
            mode={params.get('mode') === 'transfer' ? 'transfer' : 'remove'}
            locale={locale}
            role="MANAGER"
          />
        ) : params.get('view') === 'quick-add' ? (
          <QuickAdd
            locale={locale}
            catalog={{
              categories: [item.category],
              products: [
                item.product,
                { ...item.product, id: '30000000-0000-4000-8000-000000000099', name: 'Coca Cola' },
              ],
              locations,
            }}
            locationId={params.has('bottom') ? '' : locations[0].id}
            requestId="90000000-0000-4000-8000-000000000001"
          />
        ) : params.get('view') === 'need' ? (
          <NeedForm
            locale={locale}
            catalog={{
              categories: [item.category],
              products: [item.product],
              locations,
              balances: [item],
              needs: params.has('activeNeed')
                ? [
                    {
                      id: '90000000-0000-4000-8000-000000000004',
                      product_id: item.product_id,
                      status: params.get('activeNeed') === 'ORDERED' ? 'ORDERED' : 'PENDING',
                    },
                  ]
                : [],
            }}
            suggestion={
              params.has('linked')
                ? { name: item.product.name, product_id: item.product_id }
                : undefined
            }
            id="90000000-0000-4000-8000-000000000002"
            requestId="90000000-0000-4000-8000-000000000003"
          />
        ) : params.get('view') === 'review' ? (
          <ReceiptReview
            id="80000000-0000-4000-8000-000000000001"
            status="NEW"
            details={{}}
            locale={locale}
          />
        ) : params.get('view') === 'undo' ? (
          <UndoStock id="50000000-0000-4000-8000-000000000001" locale={locale} />
        ) : params.get('view') === 'desktop-only' ? (
          <DesktopOnly locale={locale}>
            <InventoryAdminActions role="OWNER" locale={locale} />
          </DesktopOnly>
        ) : params.get('view') === 'overview' ? (
          <OwnerInventory
            items={[...items, { ...item, location_id: locations[1].id, quantity: 8 }]}
            locations={locations}
            movements={[]}
            locale={locale}
          />
        ) : params.get('view') === 'time' ? (
          <LocalTime value="2026-09-09T14:00:00Z" locale={locale} />
        ) : params.get('view') === 'admin' ? (
          <InventoryAdminActions
            locale={locale}
            role={params.has('manager') ? 'MANAGER' : 'OWNER'}
          />
        ) : params.get('view') === 'items' ? (
          <ItemManager
            locale={locale}
            importing={false}
            requestId="50000000-0000-4000-8000-000000000001"
            productId={params.has('edit') ? item.product_id : undefined}
            initial={
              params.has('edit')
                ? {
                    name: item.product.name,
                    category: item.category.id,
                    unit: item.product.unit,
                    location: item.location_id,
                    minimum: '',
                    target: '',
                    cost: '',
                    currency: 'BZD',
                    quantity: '',
                    notes: '',
                    active: true,
                    mode: 'update',
                  }
                : undefined
            }
            catalog={{
              categories: [item.category!],
              locations,
              products: params.has('edit') ? [item.product] : [],
            }}
          />
        ) : params.get('view') === 'receipt' || params.get('view') === 'intake' ? (
          <ReceiptUploader
            intakeType={params.get('view') === 'intake' ? 'FUEL' : undefined}
            locale={locale}
            kind="EXPENSE"
            parentId="70000000-0000-4000-8000-000000000001"
            requestId="80000000-0000-4000-8000-000000000001"
          />
        ) : params.get('view') === 'locations' ? (
          <LocationCards locations={locations} locale={locale} canAdd />
        ) : params.get('view') === 'detail' ? (
          <ProductOverview
            item={item}
            locale={locale}
            role={params.has('crew') ? 'CREW' : 'MANAGER'}
            basePath={`/inventory/${item.location_id}/${item.product_id}`}
          />
        ) : params.get('view') === 'transfer' ? (
          <div className="max-w-lg">
            <TransferForm
              locale={locale}
              productId={item.product_id}
              sourceId={item.location_id}
              destinations={locations.slice(1)}
              requestId="50000000-0000-4000-8000-000000000001"
            />
          </div>
        ) : params.has('form') ? (
          <div className="max-w-lg">
            <StockForm
              locale={locale}
              productId={item.product_id}
              locationId={item.location_id}
              requestId="50000000-0000-4000-8000-000000000001"
              mode="remove"
              role="MANAGER"
            />
          </div>
        ) : (
          <InventoryList
            items={items}
            locale={locale}
            action={params.get('action') as 'add' | 'remove' | 'transfer' | undefined}
          />
        )}
      </main>
    </div>
    <div className="md:hidden">
      <Navigation locale={locale} />
    </div>
  </div>,
);
