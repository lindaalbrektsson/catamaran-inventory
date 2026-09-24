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
// Stock suggestions always belong to one location. A locationless Need has no
// automatically calculated quantity; never offset Bodega against Cas Cat.
export function suggestedNeedQuantity(catalog: ItemCatalog, product: string, location?: string) {
  if (!location) return null;
  const row = catalog.balances?.find((b) => b.product_id === product && b.location_id === location);
  if (!row || row.target_stock == null || Number(row.target_stock) <= Number(row.quantity))
    return null;
  return Math.round((Number(row.target_stock) - Number(row.quantity)) * 1000) / 1000;
}
export function needsShoppingPrompt(quantity: number, minimum: number | null) {
  return (
    minimum !== null && Number.isFinite(Number(minimum)) && Number(quantity) <= Number(minimum)
  );
}
export function activeNeedForLocation(
  catalog: Pick<ItemCatalog, 'needs'>,
  product: string,
  location?: string,
  exceptId?: string,
) {
  return catalog.needs?.find(
    (n) =>
      n.id !== exceptId &&
      n.product_id === product &&
      (n.status === 'PENDING' || n.status === 'ORDERED') &&
      (!location || !n.location_id || n.location_id === location),
  );
}
