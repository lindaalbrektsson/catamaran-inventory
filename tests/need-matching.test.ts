import { it, expect } from 'vitest';
import { needMatches, suggestedNeedQuantity } from '../src/lib/need-matching';
import type { ItemCatalog } from '../src/lib/item-domain';
const catalog = {
  products: [
    { id: 'a', name: 'Snorkel gear size 5', active: true },
    { id: 'b', name: 'Coca-Cola', active: true },
  ],
  locations: [{ id: 'boat' }, { id: 'land' }],
  balances: [
    { product_id: 'a', location_id: 'boat', quantity: 1, target_stock: 5 },
    { product_id: 'a', location_id: 'land', quantity: 0, target_stock: 0 },
  ],
} as ItemCatalog;
it('matches case, partial words, punctuation and minor misspellings without renaming', () => {
  for (const query of ['SNORKEL', 'gear size', 'snorkl gear'])
    expect(needMatches(catalog, query)[0].id).toBe('a');
  expect(needMatches(catalog, 'coca cola')[0].id).toBe('b');
  expect(needMatches(catalog, 'engine shaft')).toEqual([]);
});
it('suggests only the aggregate target shortfall and never negative stock purchases', () => {
  expect(suggestedNeedQuantity(catalog, 'a')).toBe(4);
  expect(suggestedNeedQuantity(catalog, 'b')).toBeNull();
  expect(
    suggestedNeedQuantity(
      { ...catalog, balances: catalog.balances?.map((b) => ({ ...b, quantity: 10 })) },
      'a',
    ),
  ).toBe(0);
});

it('suggests eight for current four and target twelve without changing inventory', () => {
  const configured = {
    ...catalog,
    balances: [{ ...catalog.balances![0], quantity: 4, minimum_stock: 6, target_stock: 12 }],
  };
  const before = JSON.stringify(configured);
  expect(suggestedNeedQuantity(configured, 'a')).toBe(8);
  expect(JSON.stringify(configured)).toBe(before);
});
