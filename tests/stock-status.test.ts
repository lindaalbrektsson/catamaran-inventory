import { expect, it } from 'vitest';
import { stockStatus, stockPriority } from '@/lib/stock-status';
it.each([
  [0, 'low'],
  [11, 'low'],
  [11.99, 'low'],
  [12, 'running'],
  [15, 'running'],
  [15.01, 'healthy'],
  [16, 'healthy'],
] as const)('minimum 12 and quantity %s means %s', (quantity, status) => {
  expect(stockStatus(quantity, 12)).toBe(status);
});
it('unset minimum remains neutral even with zero stock', () => {
  expect(stockStatus(0, null)).toBe('unconfigured');
  expect(stockStatus(100, null)).toBe('unconfigured');
});
it('zero minimum follows the same stated rule', () => {
  expect(stockStatus(0, 0)).toBe('running');
  expect(stockStatus(1, 0)).toBe('healthy');
});
it('priority is low, running, remaining without changing domain eligibility', () => {
  expect(stockPriority(2, 3)).toBe(0);
  expect(stockPriority(3, 3)).toBe(1);
  expect(stockPriority(4, 3)).toBe(2);
  expect(stockPriority(0, null)).toBe(2);
});
