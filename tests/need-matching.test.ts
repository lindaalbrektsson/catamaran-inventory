import { it, expect } from 'vitest';
import {
  needMatches,
  suggestedNeedQuantity,
  needsShoppingPrompt,
  activeNeedForLocation,
} from '../src/lib/need-matching';
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
it('suggests one location target shortfall and never negative stock purchases', () => {
  expect(suggestedNeedQuantity(catalog, 'a', 'boat')).toBe(4);
  expect(suggestedNeedQuantity(catalog, 'b', 'boat')).toBeNull();
  expect(
    suggestedNeedQuantity(
      { ...catalog, balances: catalog.balances?.map((b) => ({ ...b, quantity: 10 })) },
      'a',
      'boat',
    ),
  ).toBeNull();
});

it('suggests eight for current four and target twelve without changing inventory', () => {
  const configured = {
    ...catalog,
    balances: [{ ...catalog.balances![0], quantity: 4, minimum_stock: 6, target_stock: 12 }],
  };
  const before = JSON.stringify(configured);
  expect(suggestedNeedQuantity(configured, 'a', 'boat')).toBe(8);
  expect(JSON.stringify(configured)).toBe(before);
});

it('never pools Bodega and Cas Cat stock or invents target quantities', () => {
  const scoped = {
    ...catalog,
    balances: [
      { ...catalog.balances![0], quantity: 10, minimum_stock: 10, target_stock: 20 },
      { ...catalog.balances![1], quantity: 100, minimum_stock: 5, target_stock: 110 },
    ],
  };
  expect(suggestedNeedQuantity(scoped, 'a', 'boat')).toBe(10);
  expect(suggestedNeedQuantity(scoped, 'a', 'land')).toBe(10);
  expect(suggestedNeedQuantity(scoped, 'a')).toBeNull();
  expect(
    suggestedNeedQuantity(
      { ...scoped, balances: [{ ...scoped.balances[0], target_stock: null }] },
      'a',
      'boat',
    ),
  ).toBeNull();
});
it('prompts at/below configured minimum, never above it or when monitoring is off', () => {
  expect(needsShoppingPrompt(11, 10)).toBe(false);
  expect(needsShoppingPrompt(10, 10)).toBe(true);
  expect(needsShoppingPrompt(9, 10)).toBe(true);
  expect(needsShoppingPrompt(0, null)).toBe(false);
  expect(needsShoppingPrompt(0, 0)).toBe(true);
});
it('active matching respects location and conservatively handles unscoped Needs', () => {
  const needs = [{ id: 'n', product_id: 'a', location_id: 'boat', status: 'PENDING' as const }];
  expect(activeNeedForLocation({ needs }, 'a', 'boat')?.id).toBe('n');
  expect(activeNeedForLocation({ needs }, 'a', 'land')).toBeUndefined();
  expect(activeNeedForLocation({ needs }, 'a')?.id).toBe('n');
  expect(
    activeNeedForLocation(
      { needs: [{ ...needs[0], location_id: null, status: 'ORDERED' }] },
      'a',
      'land',
    )?.id,
  ).toBe('n');
  expect(
    activeNeedForLocation({ needs: [{ ...needs[0], status: 'DONE' }] }, 'a', 'boat'),
  ).toBeUndefined();
});
