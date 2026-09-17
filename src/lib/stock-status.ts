// Display-only classification. Low-stock / Need eligibility still uses isLowStock.
export function stockStatus(quantity: number, minimum: number | null) {
  if (minimum === null) return 'unconfigured';
  if (quantity < minimum) return 'low';
  if (quantity <= minimum * 1.25) return 'running';
  return 'healthy';
}
export function stockPriority(quantity: number, minimum: number | null) {
  const state = stockStatus(quantity, minimum);
  return state === 'low' ? 0 : state === 'running' ? 1 : 2;
}
