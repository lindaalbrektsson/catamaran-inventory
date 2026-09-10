import { z } from 'zod';
export const spendingKinds = ['EXPENSE', 'PURCHASE'] as const;
export type SpendingKind = (typeof spendingKinds)[number];
export const paymentMethods = [
  'CASH',
  'COMPANY_CARD',
  'PERSONAL_MONEY',
  'BANK_TRANSFER',
  'OTHER',
] as const;
export const spendingSchema = z.object({
  requestId: z.uuid(),
  kind: z.enum(spendingKinds),
  categoryId: z.uuid(),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
    .refine((value) => /[1-9]/.test(value)),
  currency: z.enum(['BZD', 'USD']),
  locationId: z.uuid(),
  paidBy: z.uuid(),
  paymentMethod: z.enum(paymentMethods),
  occurredAt: z.iso.datetime(),
  notes: z.string().trim().max(1000),
});
export const receiptSchema = z.object({
  requestId: z.uuid(),
  parentId: z.uuid(),
  kind: z.enum(spendingKinds),
});
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export function spendingPath(id: string, kind: SpendingKind) {
  return `/expenses/${id}?kind=${kind.toLowerCase()}`;
}
