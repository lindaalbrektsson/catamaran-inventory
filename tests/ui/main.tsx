import { createRoot } from 'react-dom/client';
import { InventoryList } from '../../src/components/inventory-list';
import { StockForm } from '../../src/components/stock-form';
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
createRoot(document.getElementById('root')!).render(
  <div>
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-6 md:block">
      <Brand locale={locale} />
      <div className="mt-10">
        <Navigation locale={locale} />
      </div>
    </aside>
    <div className="pb-24 md:ml-64">
      <header className="flex h-20 items-center border-b bg-card px-5">
        <Brand locale={locale} />
      </header>
      <main className="page">
        <PageHeader
          title={params.has('form') ? t.removeStock : 'Cas Cat'}
          description={t.inventoryIntro}
          locale={locale}
        />
        {params.has('form') ? (
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
          <InventoryList items={items} locale={locale} />
        )}
      </main>
    </div>
    <div className="md:hidden">
      <Navigation locale={locale} />
    </div>
  </div>,
);
