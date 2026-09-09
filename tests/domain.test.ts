import { describe, it, expect } from 'vitest';
import {
  can,
  isLowStock,
  moneyToMinor,
  movementType,
  stockSchema,
  units,
  movementTypes,
  roles,
} from '../src/lib/domain';
import { en, es } from '../src/lib/i18n';
const input = {
  requestId: crypto.randomUUID(),
  productId: crypto.randomUUID(),
  locationId: crypto.randomUUID(),
  mode: 'add',
  quantity: '2.125',
  reason: 'returned',
  notes: '',
};
describe('inventory input and decimal rules', () => {
  it('accepts positive decimal quantities', () =>
    expect(stockSchema.safeParse(input).success).toBe(true));
  it.each(['0', '-1', 'NaN', 'Infinity', '1e3', '1.0001', '', '1,5', '100000000000'])(
    'rejects invalid quantity %s',
    (quantity) => expect(stockSchema.safeParse({ ...input, quantity }).success).toBe(false),
  );
  it('rejects removal reasons in additions', () =>
    expect(stockSchema.safeParse({ ...input, reason: 'tour' }).success).toBe(false));
  it('maps operational reasons to ledger types', () => {
    expect(movementType('remove', 'damaged')).toBe('DAMAGE');
    expect(movementType('remove', 'tour')).toBe('TOUR_USE');
  });
  it('only alerts below an explicitly configured minimum', () => {
    expect(isLowStock(0, null)).toBe(false);
    expect(isLowStock(3, 3)).toBe(false);
    expect(isLowStock(2, 3)).toBe(true);
  });
  it('keeps money arithmetic exact', () => {
    expect(moneyToMinor('0.10') + moneyToMinor('0.20')).toBe(30n);
    expect(moneyToMinor('123456789.99')).toBe(12345678999n);
    expect(() => moneyToMinor('1.001')).toThrow();
  });
});
describe('permissions and translations', () => {
  it('restricts administration and general stock edits', () => {
    expect(can('OWNER', 'users.manage')).toBe(true);
    expect(can('MANAGER', 'users.manage')).toBe(false);
    expect(can('CAPTAIN', 'inventory.add')).toBe(false);
    expect(can('CREW', 'inventory.remove')).toBe(false);
    expect(can('CREW', 'inventory.consume')).toBe(true);
  });
  it('has matching dictionaries and all domain labels', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of [...units, ...movementTypes, ...roles]) {
      expect(en[key]).toBeTruthy();
      expect(es[key]).toBeTruthy();
    }
    expect(es.MANAGER).toBe('Encargado');
  });
});
