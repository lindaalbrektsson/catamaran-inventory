import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InventoryItem } from '@/lib/inventory';
import type { Location } from '@/lib/database.types';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({
  from: vi.fn(),
  ids: [] as string[],
  rows: [] as { id: string; product_id: string; status: string }[],
}));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ from: m.from }) }));
vi.mock('@/lib/inventory', () => ({
  collect: async (read: (a: number, b: number) => Promise<{ data: unknown[] }>) =>
    (await read(0, 499)).data,
}));
import { LowNeedSuggestions } from '@/components/low-need-suggestions';
const location = { id: 'location', name: 'Bodega' } as Location;
const item = {
  product_id: 'linked-product',
  quantity: 10,
  minimum_stock: 3,
  product: { name: 'Fixture item' },
} as InventoryItem;
beforeEach(() => {
  m.ids = [];
  m.rows = [];
  m.from.mockReset();
  const query = {
    select: () => query,
    eq: () => query,
    in: (key: string, values: string[]) => {
      if (key === 'product_id') m.ids = values;
      return query;
    },
    order: () => query,
    range: async () => ({ data: m.rows.filter((row) => m.ids.includes(row.product_id)) }),
  };
  m.from.mockReturnValue(query);
});
it('empty/inactive location skips the Needs read entirely', async () => {
  expect(await LowNeedSuggestions({ items: [], location, locale: 'en' })).toBeNull();
  expect(m.from).not.toHaveBeenCalled();
});
it('healthy stock with an existing Ordered Need still shows its linked status', async () => {
  m.rows = [
    { id: 'existing-need', product_id: 'linked-product', status: 'ORDERED' },
    { id: 'unrelated', product_id: 'other', status: 'PENDING' },
  ];
  const markup = renderToStaticMarkup(
    await LowNeedSuggestions({ items: [item], location, locale: 'en' }),
  );
  expect(m.ids).toEqual(['linked-product']);
  expect(markup).toContain('/needs/existing-need');
  expect(markup).toContain('Ordered');
  expect(markup).not.toContain('unrelated');
});
it('below minimum without an active Need keeps the exact product link in Spanish', async () => {
  const markup = renderToStaticMarkup(
    await LowNeedSuggestions({ items: [{ ...item, quantity: 1 }], location, locale: 'es' }),
  );
  expect(markup).toContain('/needs/new?product=linked-product');
  expect(markup).toContain('Agregar a compras necesarias');
});
