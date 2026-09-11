import { z } from 'zod';
import { units } from './domain';
import { needMatches, needNameKey } from './need-matching';
import type { ItemCatalog } from './item-domain';

const quantity = z
  .number()
  .finite()
  .positive()
  .max(99999999999.999)
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.001);
export const extractionSchema = z
  .object({
    supplier: z.string().max(200).nullable(),
    date: z.string().max(30).nullable(),
    total: z.number().finite().min(0).max(999999999999.99).nullable(),
    currency: z.string().max(10).nullable(),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(150),
            quantity: z.number().finite().nullable(),
            check: z.boolean(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export const scanReviewSchema = z
  .object({
    supplier: z.string().trim().max(200),
    date: z.union([z.literal(''), z.iso.date()]),
    total: z.union([z.literal(''), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/)]),
    currency: z.enum(['', 'BZD', 'USD']),
    rows: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(49),
            name: z.string().trim().min(1).max(150),
            quantity: z.number().finite().nullable(),
            action: z.enum(['IGNORE', 'INVENTORY', 'NEED']),
            product: z.union([z.literal(''), z.uuid()]),
            category: z.union([z.literal(''), z.uuid()]),
            unit: z.enum(units),
            location: z.union([z.literal(''), z.uuid()]),
            country: z.enum(['BELIZE', 'USA']),
            confirmSimilar: z.boolean(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine((v) => new Set(v.rows.map((r) => r.index)).size === v.rows.length)
  .refine((v) =>
    v.rows.every(
      (r) => r.action === 'IGNORE' || r.quantity === null || quantity.safeParse(r.quantity).success,
    ),
  );
export type ScanReview = z.infer<typeof scanReviewSchema>;
export function scanMatch(catalog: ItemCatalog, name: string) {
  const matches = needMatches(catalog, name);
  const exact = matches.filter((p) => needNameKey(p.name) === needNameKey(name));
  return {
    status: exact.length === 1 ? 'MATCHED' : matches.length ? 'UNCERTAIN' : 'NEW',
    matches,
    product: exact.length === 1 ? exact[0].id : '',
  } as const;
}
export function initialReview(
  result: Extraction,
  catalog: ItemCatalog,
  type: 'NOTE' | 'RECEIPT' = 'NOTE',
): ScanReview {
  return {
    supplier: type === 'RECEIPT' ? (result.supplier ?? '') : '',
    date: type === 'RECEIPT' && z.iso.date().safeParse(result.date).success ? result.date! : '',
    total: type === 'NOTE' || result.total === null ? '' : String(result.total),
    currency:
      type === 'RECEIPT' && (result.currency === 'BZD' || result.currency === 'USD')
        ? result.currency
        : '',
    rows: result.items.map((item, index) => ({
      index,
      name: item.name,
      quantity: item.quantity,
      action: 'IGNORE',
      product: scanMatch(catalog, item.name).product,
      category: '',
      unit: 'piece',
      location: '',
      country: 'BELIZE',
      confirmSimilar: false,
    })),
  };
}
