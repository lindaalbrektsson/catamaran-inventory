import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InventoryItem } from '@/lib/inventory';
import type { Location } from '@/lib/database.types';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({
  from: vi.fn(),
  ids: [] as string[],
  scopes: [] as string[],
  rows: [] as { id: string; product_id: string; status: string; location_id?: string | null }[],
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
  location_id: 'location',
  quantity: 10,
  minimum_stock: 3,
  product: { name: 'Fixture item', unit: 'bottle' },
} as InventoryItem;
beforeEach(() => {
  m.ids = [];
  m.rows = [];
  m.scopes = [];
  m.from.mockReset();
  const query = {
    select: () => query,
    eq: () => query,
    or: (scope: string) => {
      m.scopes.push(scope);
      return query;
    },
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
  expect(markup).toContain('+ Agregar a Por comprar');
  expect(markup).toContain('location=location');
  expect(m.scopes).toContain('location_id.eq.location,location_id.is.null');
});

it('at minimum opens a visible detail action with a per-location target suggestion', async () => {
  const markup = renderToStaticMarkup(
    await LowNeedSuggestions({
      items: [{ ...item, quantity: 10, minimum_stock: 10, target_stock: 20 }],
      location,
      locale: 'es',
      expanded: true,
    }),
  );
  expect(markup).toContain('+ Agregar a Por comprar');
  expect(markup).toContain('Sugerencia: comprar 10 botellas');
  expect(markup).not.toContain('<details');
});
it('above minimum shows no shopping creation prompt', async () => {
  expect(await LowNeedSuggestions({ items: [item], location, locale: 'en' })).toBeNull();
});
it('unset target does not invent a suggestion, and another location Need does not suppress the action', async () => {
  m.rows = [
    {
      id: 'other-location-need',
      product_id: item.product_id,
      status: 'PENDING',
      location_id: 'other-location',
    },
  ];
  const markup = renderToStaticMarkup(
    await LowNeedSuggestions({
      items: [{ ...item, quantity: 3, target_stock: null }],
      location,
      locale: 'en',
      expanded: true,
    }),
  );
  expect(markup).toContain('+ Add to shopping list');
  expect(markup).not.toContain('Suggestion: buy');
  expect(markup).not.toContain('/needs/other-location-need');
});
