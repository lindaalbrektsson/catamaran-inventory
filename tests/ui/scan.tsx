import { createRoot } from 'react-dom/client';
import { ScanReviewForm } from '@/components/scan-review';
import { ScanCapture } from '@/components/scan-capture';
import type { ItemCatalog } from '@/lib/item-domain';
import '@/app/globals.css';
const q = new URLSearchParams(location.search),
  locale = q.get('lang') === 'es' ? 'es' : 'en';
const catalog = {
  categories: [
    { id: '20000000-0000-4000-8000-000000000001', name_en: 'Bar', name_es: 'Bar', active: true },
  ],
  locations: [{ id: '10000000-0000-4000-8000-000000000003', name: 'Bodega', active: true }],
  products: [
    { id: '30000000-0000-4000-8000-000000000001', name: 'Water', active: true },
    { id: '30000000-0000-4000-8000-000000000002', name: 'Water bottles', active: true },
  ],
} as unknown as ItemCatalog;
createRoot(document.getElementById('root')!).render(
  <div className="page">
    {q.has('capture') ? (
      <ScanCapture locale={locale} owner />
    ) : (
      <ScanReviewForm
        id="40000000-0000-4000-8000-000000000001"
        locale={locale}
        type={q.has('receipt') ? 'RECEIPT' : 'NOTE'}
        catalog={catalog}
        result={{
          supplier: 'Example Store',
          date: '2026-09-11',
          total: 12.5,
          currency: 'BZD',
          items: [
            { name: 'Wat', quantity: 24, check: true },
            { name: 'New anchor', quantity: 1, check: false },
          ],
        }}
      />
    )}
  </div>,
);
