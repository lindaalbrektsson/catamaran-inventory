import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InventoryList } from '@/components/inventory-list';
import type { InventoryItem } from '@/lib/inventory';
it('stock problems sort first, neutral unset minimum does not claim sufficient stock', () => {
  const items = ['Alpha', 'Zulu', 'Neutral'].map(
    (name, index) =>
      ({
        product_id: name,
        location_id: 'location',
        quantity: 2,
        minimum_stock: index === 2 ? null : index === 1 ? 4 : 1,
        product: { name, unit: 'piece' },
        category: { id: 'category', name_en: 'Bar', name_es: 'Bar' },
      }) as InventoryItem,
  );
  const html = renderToStaticMarkup(createElement(InventoryList, { items, locale: 'en' }));
  expect(html.indexOf('>Zulu<')).toBeLessThan(html.indexOf('>Alpha<'));
  expect(html.indexOf('>Alpha<')).toBeLessThan(html.indexOf('>Neutral<'));
  expect(html).toContain('No minimum set');
  expect(html).not.toContain('Stock ready');
  expect(items[0].product.name).toBe('Alpha');
});
