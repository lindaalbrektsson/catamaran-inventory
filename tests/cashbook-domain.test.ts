import { describe, expect, it } from 'vitest';
import {
  cashbookBelizeDate,
  cashbookDateRange,
  foodEntryView,
  foodSettlementPeriod,
  foodTotalMinor,
  groupUnpaidFood,
  isCashbookDate,
  minorToInput,
  moneyToMinor,
  monthlyDueDate,
  safeMinor,
  sumMinor,
} from '../src/lib/cashbook-domain';

describe('Cashbook exact money', () => {
  it('parses cents without float multiplication, preserving zero only when explicitly allowed', () => {
    expect(moneyToMinor('0.29')).toBe(29);
    expect(moneyToMinor(19.99)).toBe(1999);
    expect(moneyToMinor(' 1000.5 ')).toBe(100050);
    expect(moneyToMinor('0', { allowZero: true })).toBe(0);
    expect(moneyToMinor('9999999999.99')).toBe(999999999999);
    expect(minorToInput(-29)).toBe('-0.29');
    expect(minorToInput('9007199254740991')).toBe('90071992547409.91');
    expect(sumMinor([29, 1, '-10'])).toBe(20);
  });
  it.each([
    '',
    '0',
    '-1',
    '+1',
    '1.001',
    '1e3',
    'NaN',
    'Infinity',
    '1,000',
    '1,25',
    '10000000000',
    '0x10',
  ])('rejects ambiguous or invalid amount %s', (value) => {
    expect(() => moneyToMinor(value)).toThrow('CASHBOOK_AMOUNT');
  });
  it('rejects precision lost before parsing and unsafe aggregate balances', () => {
    expect(() => moneyToMinor(0.1 + 0.2)).toThrow('CASHBOOK_AMOUNT');
    expect(() => safeMinor(12.5)).toThrow('CASHBOOK_AMOUNT');
    expect(() => safeMinor('9007199254740992')).toThrow('CASHBOOK_AMOUNT');
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow('CASHBOOK_AMOUNT');
    expect(sumMinor([Number.MAX_SAFE_INTEGER, 1, -1])).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('multiplies food quantity by unit cents exactly without updating a template', () => {
    expect(foodTotalMinor('3', 29)).toBe(87);
    expect(foodTotalMinor(2, 2000)).toBe(4000);
    for (const quantity of [0, -1, 1.5, '1e2', 100001])
      expect(() => foodTotalMinor(quantity, 100)).toThrow('CASHBOOK_QUANTITY');
    expect(() => foodTotalMinor(1, 0)).toThrow('CASHBOOK_AMOUNT');
    expect(() => foodTotalMinor(100000, 999999999999)).toThrow('CASHBOOK_AMOUNT');
  });
});

describe('Cashbook operational dates', () => {
  it('changes the Belize business day at 06:00 UTC, including year boundaries', () => {
    expect(cashbookBelizeDate(new Date('2026-09-24T05:59:59Z'))).toBe('2026-09-23');
    expect(cashbookBelizeDate(new Date('2026-09-24T06:00:00Z'))).toBe('2026-09-24');
    expect(cashbookBelizeDate(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31');
  });
  it('settles Thursday through Wednesday inclusive, including month and year boundaries', () => {
    expect(foodSettlementPeriod('2026-09-23')).toEqual({ from: '2026-09-17', to: '2026-09-23' });
    expect(foodSettlementPeriod('2026-09-24')).toEqual({ from: '2026-09-24', to: '2026-09-30' });
    expect(foodSettlementPeriod('2026-12-31')).toEqual({ from: '2026-12-31', to: '2027-01-06' });
    expect(foodSettlementPeriod('2028-02-29')).toEqual({ from: '2028-02-24', to: '2028-03-01' });
    expect(foodEntryView('2026-09-23', '2026-09-24')).toBe('previous');
    expect(foodEntryView('2026-09-24', '2026-09-24')).toBe('today');
    expect(foodEntryView('2026-09-30', '2026-09-24')).toBe('period');
    expect(foodEntryView('2026-10-01', '2026-09-24')).toBe('future');
  });
  it('clamps monthly due day to the actual last day, including leap years', () => {
    expect(monthlyDueDate('2026-02', 31)).toBe('2026-02-28');
    expect(monthlyDueDate('2028-02', 31)).toBe('2028-02-29');
    expect(monthlyDueDate('2026-04', 31)).toBe('2026-04-30');
    expect(monthlyDueDate('2026-12', 31)).toBe('2026-12-31');
    expect(monthlyDueDate('2026-09', 15)).toBe('2026-09-15');
    expect(() => monthlyDueDate('2026-13', 1)).toThrow('CASHBOOK_DATE');
    expect(() => monthlyDueDate('2026-09', 32)).toThrow('CASHBOOK_DATE');
    expect(() => monthlyDueDate('2026-09', 1.5)).toThrow('CASHBOOK_DATE');
  });
  it('validates real dates and inclusive ranges', () => {
    expect(isCashbookDate('2028-02-29')).toBe(true);
    for (const date of ['2026-02-29', '2026-13-01', '2026-09-31', '2026-9-01', '0000-01-01'])
      expect(isCashbookDate(date)).toBe(false);
    expect(cashbookDateRange('2026-09-24', '2026-09-24')).toEqual({
      from: '2026-09-24',
      to: '2026-09-24',
    });
    expect(() => cashbookDateRange('2026-09-25', '2026-09-24')).toThrow('CASHBOOK_DATE');
  });
  it('groups every unpaid food day, keeping older debt in the settlement preview', () => {
    const rows = [
      { id: 'a', effective_date: '2026-09-24', total_cents: 29, status: 'PENDING' },
      { id: 'b', effective_date: '2026-08-01', total_cents: 4000, status: 'PENDING' },
      { id: 'c', effective_date: '2026-09-24', total_cents: 71, status: 'PENDING' },
      { id: 'd', effective_date: '2026-09-23', total_cents: 9999, status: 'PAID' },
    ];
    const groups = groupUnpaidFood(rows);
    expect(groups.map((group) => [group.date, group.totalCents])).toEqual([
      ['2026-08-01', 4000],
      ['2026-09-24', 100],
    ]);
    expect(groups.flatMap((group) => group.entries.map((entry) => entry.id))).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});
