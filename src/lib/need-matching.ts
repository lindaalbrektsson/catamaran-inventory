import type { ItemCatalog } from './item-domain';
export function needNameKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}
export function needMatches(catalog: ItemCatalog, text: string) {
  const query = needNameKey(text);
  if (!query) return [];
  return catalog.products
    .filter((p) => p.active)
    .map((product) => {
      const name = needNameKey(product.name);
      const partial = name.includes(query);
      // Adjacent bigram overlap catches minor spelling errors without changing names.
      const grams = new Set(
        Array.from({ length: Math.max(0, query.length - 1) }, (_, i) => query.slice(i, i + 2)),
      );
      const overlap = [...grams].filter((g) => name.includes(g)).length / Math.max(1, grams.size);
      return {
        product,
        score:
          name === query ? 3 : partial ? 2 : query.length >= 4 && overlap >= 0.65 ? overlap : 0,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, 8)
    .map((x) => x.product);
}
export function suggestedNeedQuantity(catalog: ItemCatalog, product: string) {
  const rows = (catalog.balances ?? []).filter(
    (b) => b.product_id === product && catalog.locations.some((l) => l.id === b.location_id),
  );
  if (!rows.length || !rows.some((b) => Number(b.target_stock) > 0)) return null;
  return Math.max(
    0,
    Math.round(rows.reduce((n, b) => n + Number(b.target_stock) - Number(b.quantity), 0) * 1000) /
      1000,
  );
}
