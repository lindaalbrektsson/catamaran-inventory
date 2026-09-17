import { it, expect } from 'vitest';
import { mergePreview } from '../src/lib/merge-preview';
import type { Balance, Location } from '../src/lib/database.types';
const locations = [
  { id: 'b', name: 'Bodega' },
  { id: 'c', name: 'Cas Cat' },
] as Location[];
const balance = (
  product_id: string,
  location_id: string,
  quantity: number,
  minimum_stock: number | null = null,
) => ({ product_id, location_id, quantity, minimum_stock, target_stock: null }) as Balance;
it('combines only within each location, exposing lost source minimum', () => {
  const rows = mergePreview(
    'a',
    'z',
    [
      balance('a', 'b', 5, 6),
      balance('a', 'c', 2, 3),
      balance('z', 'b', 3),
      balance('z', 'c', 7, 4),
    ],
    locations,
  );
  expect(rows.map((r) => r.quantity)).toEqual([8, 9]);
  expect(rows[0]).toMatchObject({ sourceMinimum: 6, minimum: null });
  expect(rows[1].minimum).toBe(4);
});
it('copies source settings only if target has no configuration at that location', () => {
  expect(
    mergePreview('a', 'z', [balance('a', 'b', 0.1, 6), balance('z', 'c', 0.2)], locations)[0],
  ).toMatchObject({ quantity: 0.1, minimum: 6 });
});
