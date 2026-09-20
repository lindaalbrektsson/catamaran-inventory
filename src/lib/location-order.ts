export function locationOrder<T extends { name: string }>(locations: T[]): T[] {
  const rank = (name: string) => (name === 'Bodega' ? 0 : name === 'Cas Cat' ? 1 : 2);
  return [...locations].sort((a, b) => rank(a.name) - rank(b.name));
}
