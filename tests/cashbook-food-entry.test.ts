import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('@/lib/auth', () => ({ getProfile: async () => ({ active: true, role: 'OWNER' }) }));
vi.mock('@/lib/inventory', () => ({
  collect: async (fn: (a: number, b: number) => Promise<{ data: unknown[] }>) =>
    (await fn(0, 99)).data,
}));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    from: m.from,
    rpc: async () => ({
      data: {
        cash_cents: 0,
        account_cents: 0,
        total_cents: 0,
        cash_opened: true,
        account_opened: true,
      },
      error: null,
    }),
  }),
}));
import { cashbookData } from '../src/lib/cashbook';
it('Cashflow loads active Food concepts for the shared form without loading debt history', async () => {
  const template = { id: 'food', kind: 'FOOD', active: true };
  m.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: (...args: unknown[]) => {
        m.eq(...args);
        return q;
      },
      gte: () => q,
      lte: () => q,
      order: () => q,
      range: async () => ({ data: table === 'cashbook_templates' ? [template] : [], error: null }),
    };
    return q;
  });
  const data = await cashbookData({ view: 'ledger' });
  expect(data.templates).toEqual([template]);
  expect(m.eq).toHaveBeenCalledWith('kind', 'FOOD');
  expect(m.eq).toHaveBeenCalledWith('active', true);
  expect(m.from).not.toHaveBeenCalledWith('cashbook_due');
});
