import { z } from 'zod';
import { units } from './domain';
import type { Category, Location, Product, Balance, PurchaseNeed } from './database.types';
const stock = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/)
  .or(z.literal(''));
export const itemSchema = z
  .object({
    sourceRow: z.number().int().min(2).max(201).optional(),
    name: z.string().trim().min(1).max(150),
    category: z.uuid(),
    unit: z.enum(units),
    location: z.uuid(),
    minimum: stock,
    target: stock,
    cost: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
      .or(z.literal('')),
    currency: z.enum(['BZD', 'USD']),
    quantity: stock,
    notes: z.string().max(1000),
    active: z.boolean(),
    mode: z.enum(['create', 'skip', 'update']),
  })
  .refine((r) => !r.minimum || !r.target || Number(r.target) >= Number(r.minimum))
  .refine((r) => r.active || !Number(r.quantity));
export type ItemInput = z.infer<typeof itemSchema>;
export type ItemCatalog = {
  categories: Category[];
  locations: Location[];
  products: Product[];
  balances?: Balance[];
  needs?: Pick<PurchaseNeed, 'id' | 'product_id' | 'status'>[];
};
export type ItemError =
  | 'ITEM_INVALID'
  | 'ITEM_DUPLICATE'
  | 'ITEM_STOCK_CONFLICT'
  | 'ITEM_UNIT_CONFLICT'
  | 'ITEM_FILE'
  | 'ITEM_FAILED';
export type PreviewRow = { row: number; value: ItemInput; errors: ItemError[]; duplicate: boolean };
export function validateItems(values: ItemInput[], catalog: ItemCatalog): PreviewRow[] {
  const names = values.map((r) => r.name.trim().toLowerCase());
  return values.map((value, index) => {
    const errors: ItemError[] = [];
    if (Object.values(value).includes('__INVALID_CELL__')) errors.push('ITEM_INVALID');
    const matches = catalog.products.filter((p) => p.name.trim().toLowerCase() === names[index]);
    if (
      !itemSchema.safeParse(value).success ||
      !catalog.categories.some((c) => c.id === value.category && c.active) ||
      !catalog.locations.some((l) => l.id === value.location && l.active)
    )
      errors.push('ITEM_INVALID');
    if (
      names.filter((n) => n === names[index]).length > 1 ||
      matches.length > 1 ||
      (matches.length === 0 && value.mode !== 'create')
    )
      errors.push('ITEM_DUPLICATE');
    if (matches.length && value.mode === 'create') errors.push('ITEM_DUPLICATE');
    if (matches.length && value.mode === 'update') {
      if (Number(value.quantity)) errors.push('ITEM_STOCK_CONFLICT');
      if (matches[0].unit !== value.unit) errors.push('ITEM_UNIT_CONFLICT');
    }
    return { row: value.sourceRow ?? index + 2, value, errors, duplicate: matches.length > 0 };
  });
}

// Editing is identified by the stable product ID, not by its previous name.
// Historical-unit validation remains authoritative in the configure_item RPC.
export function validateItemEdit(value: ItemInput, id: string, catalog: ItemCatalog): ItemError[] {
  if (
    !itemSchema.safeParse(value).success ||
    Number(value.quantity) ||
    value.mode !== 'update' ||
    !catalog.products.some((p) => p.id === id) ||
    !catalog.categories.some((c) => c.id === value.category && c.active) ||
    !catalog.locations.some((l) => l.id === value.location && l.active)
  )
    return ['ITEM_INVALID'];
  if (
    catalog.products.some(
      (p) => p.id !== id && p.name.trim().toLowerCase() === value.name.trim().toLowerCase(),
    )
  )
    return ['ITEM_DUPLICATE'];
  return [];
}
