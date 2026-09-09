import { z } from 'zod';

export const roles = ['OWNER', 'MANAGER', 'CAPTAIN', 'CREW'] as const;
export type Role = (typeof roles)[number];
export const units = [
  'bottle',
  'can',
  'piece',
  'box',
  'case',
  'gallon',
  'liter',
  'pound',
  'kilogram',
  'pack',
  'roll',
  'other',
] as const;
export type Unit = (typeof units)[number];
export const movementTypes = [
  'PURCHASE',
  'ADD',
  'REMOVE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'STOCK_COUNT_ADJUSTMENT',
  'DAMAGE',
  'LOSS',
  'STAFF_USE',
  'TOUR_USE',
  'CORRECTION',
] as const;
export type MovementType = (typeof movementTypes)[number];
export type Permission =
  | 'inventory.read'
  | 'inventory.add'
  | 'inventory.remove'
  | 'inventory.consume'
  | 'catalog.manage'
  | 'users.manage'
  | 'audit.read';
const permissions: Record<Role, readonly Permission[]> = {
  OWNER: [
    'inventory.read',
    'inventory.add',
    'inventory.remove',
    'inventory.consume',
    'catalog.manage',
    'users.manage',
    'audit.read',
  ],
  MANAGER: [
    'inventory.read',
    'inventory.add',
    'inventory.remove',
    'inventory.consume',
    'audit.read',
  ],
  CAPTAIN: ['inventory.read', 'inventory.consume'],
  CREW: ['inventory.read', 'inventory.consume'],
};
export function can(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}
export const reasons = [
  'returned',
  'correction',
  'other',
  'tour',
  'damaged',
  'lost',
  'staff',
] as const;
export type Reason = (typeof reasons)[number];
export function movementType(mode: 'add' | 'remove', reason: Reason): MovementType {
  if (mode === 'add') return 'ADD';
  return (
    ({ tour: 'TOUR_USE', damaged: 'DAMAGE', lost: 'LOSS', staff: 'STAFF_USE' } as const)[
      reason as 'tour' | 'damaged' | 'lost' | 'staff'
    ] ?? 'REMOVE'
  );
}
// Quantity stays a decimal string until it crosses the Supabase RPC boundary.
export const stockSchema = z
  .object({
    requestId: z.uuid(),
    productId: z.uuid(),
    locationId: z.uuid(),
    mode: z.enum(['add', 'remove']),
    quantity: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/)
      .refine((v) => /[1-9]/.test(v)),
    reason: z.enum(reasons),
    notes: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    const allowed: readonly Reason[] =
      value.mode === 'add'
        ? ['returned', 'correction', 'other']
        : ['tour', 'damaged', 'lost', 'staff', 'other'];
    if (!allowed.includes(value.reason))
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'INVALID_INPUT' });
  });
export function isLowStock(quantity: number, minimum: number | null) {
  return minimum !== null && quantity < minimum;
}

// Future financial modules must use integer minor units or PostgreSQL numeric.
export function moneyToMinor(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_MONEY');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
