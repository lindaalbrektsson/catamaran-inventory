import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({
  role: 'OWNER',
  rows: [] as Record<string, unknown>[],
  eq: [] as [string, unknown][],
  revalidate: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireProfile: async () => ({ id: 'actor', role: m.role }),
  getLocale: async () => 'en',
}));
vi.mock('@/lib/item-catalog', () => ({
  itemCatalog: async () => ({ products: [], locations: [] }),
}));
vi.mock('@/lib/inventory', () => ({
  collect: async (read: (a: number, b: number) => Promise<{ data: unknown[] }>) =>
    (await read(0, 499)).data,
}));
vi.mock('@/components/need-filters', () => ({ NeedFilters: () => null }));
vi.mock('@/components/need-progress', () => ({ NeedProgress: () => null }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    from: () => {
      const conditions: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          conditions.push([k, v]);
          m.eq.push([k, v]);
          return query;
        },
        order: () => query,
        range: async () => ({
          data: m.rows.filter((r) => conditions.every(([k, v]) => r[k] === v)),
        }),
        single: async () => ({ data: m.rows[0], error: null }),
      };
      return query;
    },
    rpc: m.rpc,
  }),
}));
import Needs from '@/app/(workspace)/needs/page';
import { advanceNeed } from '@/lib/quick-actions';
const id = '90000000-0000-4000-8000-000000000001';
beforeEach(() => {
  m.role = 'OWNER';
  m.eq = [];
  m.revalidate.mockReset();
  m.rpc.mockReset();
  m.rows = ['PENDING', 'ORDERED', 'DONE'].map((status, index) => ({
    id: index === 0 ? id : String(index),
    name: status + ' fixture',
    status,
    archived: false,
    version: 1,
    country: 'BELIZE',
    created_at: '2026-09-16T12:00:00Z',
  }));
});
it.each(['PENDING', 'ORDERED', 'DONE', ''])('server query applies status %s', async (status) => {
  const html = renderToStaticMarkup(await Needs({ searchParams: Promise.resolve({ status }) }));
  for (const state of ['PENDING', 'ORDERED', 'DONE'])
    expect(html.includes(state + ' fixture')).toBe(!status || status === state);
  expect(m.eq.some(([k]) => k === 'status')).toBe(!!status);
});
it('missing status defaults to Pending, while explicit empty means all', async () => {
  await Needs({ searchParams: Promise.resolve({}) });
  expect(m.eq).toContainEqual(['status', 'PENDING']);
});
it.each([
  ['OWNER', 'PENDING', 'ORDERED'],
  ['MANAGER', 'PENDING', 'ORDERED'],
  ['OWNER', 'ORDERED', 'DONE'],
  ['MANAGER', 'ORDERED', 'DONE'],
])(
  'successful %s %s to %s status RPC revalidates and leaves Pending server results',
  async (role, from, to) => {
    m.role = role;
    m.rows[0].status = from;
    m.rows[0].name = 'transition fixture';
    m.rpc.mockImplementation(async (_name, args) => {
      m.rows[0].status = args.p_values.status;
      return { error: null };
    });
    const f = new FormData();
    f.set('id', id);
    f.set('version', '1');
    f.set('requestId', id);
    expect(await advanceNeed({}, f)).toEqual({});
    expect(m.rpc).toHaveBeenCalledWith(
      'save_purchase_need',
      expect.objectContaining({ p_values: expect.objectContaining({ status: to }) }),
    );
    expect(m.revalidate).toHaveBeenCalledWith('/needs', 'layout');
    const html = renderToStaticMarkup(
      await Needs({ searchParams: Promise.resolve({ status: from }) }),
    );
    expect(html).not.toContain('transition fixture');
  },
);
it('failed status write stays visible and does not pretend success', async () => {
  m.rpc.mockResolvedValue({ error: { message: 'STALE_NEED' } });
  const f = new FormData();
  f.set('id', id);
  f.set('version', '1');
  f.set('requestId', id);
  expect(await advanceNeed({}, f)).toEqual({ error: 'STALE_NEED' });
  expect(m.revalidate).not.toHaveBeenCalled();
  const html = renderToStaticMarkup(
    await Needs({ searchParams: Promise.resolve({ status: 'PENDING' }) }),
  );
  expect(html).toContain('PENDING fixture');
});
