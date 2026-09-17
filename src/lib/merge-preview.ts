import type { Balance, Location } from './database.types';
// Stock precision is fixed to three decimals by the database.
export function mergePreview(
  source: string,
  target: string,
  balances: Balance[],
  locations: Location[],
) {
  return locations.map((location) => {
    const a = balances.find((b) => b.product_id === source && b.location_id === location.id);
    const b = balances.find((b) => b.product_id === target && b.location_id === location.id);
    return {
      location: location.name,
      quantity:
        (Math.round(Number(a?.quantity ?? 0) * 1000) +
          Math.round(Number(b?.quantity ?? 0) * 1000)) /
        1000,
      sourceMinimum: a?.minimum_stock ?? null,
      minimum: b ? b.minimum_stock : (a?.minimum_stock ?? null),
      target: b ? b.target_stock : (a?.target_stock ?? null),
    };
  });
}
