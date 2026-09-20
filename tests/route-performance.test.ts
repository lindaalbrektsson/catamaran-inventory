import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  active: 0,
  peak: 0,
  starts: [] as string[],
  blockSecondary: false,
  blockInventory: false,
  failInventory: false,
}));
async function delay<T>(name: string, value: T): Promise<T> {
  state.starts.push(name);
  state.active++;
  state.peak = Math.max(state.peak, state.active);
  await new Promise((resolve) => setTimeout(resolve, 100));
  state.active--;
  return value;
}
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  requireProfile: async () => ({ role: 'OWNER', id: 'fixture' }),
  getLocale: async () => 'en',
}));
vi.mock('@/lib/inventory', () => ({
  collect: async (read: (a: number, b: number) => Promise<{ data: unknown[] }>) =>
    (await read(0, 499)).data,
  getLocations: () => delay('locations', []),
  getLocation: () => delay('location', { id: 'fixture', name: 'Bodega' }),
  getInventory: () =>
    state.failInventory
      ? Promise.reject(new Error('DATA_LOAD_FAILED'))
      : state.blockInventory
        ? new Promise(() => {})
        : delay('inventory', []),
}));
vi.mock('@/lib/tasks', () => ({
  taskSummary: () =>
    state.blockSecondary
      ? new Promise(() => {})
      : delay('tasks', { tasks: [], people: [], types: [] }),
}));
vi.mock('@/lib/documents', () => ({
  getDocuments: () => (state.blockSecondary ? new Promise(() => {}) : delay('documents', [])),
}));
vi.mock('@/lib/item-catalog', () => ({ itemCatalog: () => delay('catalog', {}) }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({
    from: (table: string) =>
      table === 'inventory_balances'
        ? {
            select: () => ({
              neq: () => ({
                order: () => ({
                  order: () => ({
                    range: () => delay('transfer-balances', { data: [], error: null }),
                  }),
                }),
              }),
            }),
          }
        : {
            select: () => ({ eq: () => ({ eq: () => delay('needs', { count: 0, error: null }) }) }),
          },
  }),
}));
vi.mock('@/components/quick-add', () => ({ QuickAdd: () => null }));
vi.mock('@/components/quick-move', () => ({ QuickMove: () => null }));
vi.mock('@/components/low-need-suggestions', () => ({ LowNeedSuggestions: () => null }));
import Home from '@/app/(workspace)/page';
import LocationPage from '@/app/(workspace)/inventory/[locationId]/page';
beforeEach(() => {
  state.blockSecondary = false;
  state.blockInventory = false;
  state.failInventory = false;
  state.active = 0;
  state.peak = 0;
  state.starts = [];
});
it('measures Home data scheduling with controlled 100ms read latency', async () => {
  const start = performance.now();
  await Home();
  console.info(
    JSON.stringify({
      benchmark: 'home',
      elapsedMs: Math.round(performance.now() - start),
      peak: state.peak,
      starts: state.starts,
    }),
  );
  expect(state.starts).toContain('locations');
  expect(state.peak).toBe(5);
});
it.each(['view', 'add', 'transfer'])(
  'measures location %s with controlled 100ms read latency',
  async (action) => {
    const start = performance.now();
    await LocationPage({
      params: Promise.resolve({ locationId: 'fixture' }),
      searchParams: Promise.resolve(action === 'view' ? {} : { action }),
    });
    console.info(
      JSON.stringify({
        benchmark: action,
        elapsedMs: Math.round(performance.now() - start),
        peak: state.peak,
        starts: state.starts,
      }),
    );
    expect(state.starts).toContain('location');
    expect(state.peak).toBe(action === 'transfer' ? 4 : 2);
    if (action !== 'transfer') expect(state.starts).not.toContain('transfer-balances');
  },
);

it('Home location actions render without waiting for stalled Tasks or Documents', async () => {
  state.blockSecondary = true;
  const result = await Promise.race([
    Home(),
    new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
  ]);
  expect(result).not.toBeNull();
});

it('location header and actions render while inventory is still pending', async () => {
  state.blockInventory = true;
  const result = await Promise.race([
    LocationPage({
      params: Promise.resolve({ locationId: 'fixture' }),
      searchParams: Promise.resolve({}),
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), 500)),
  ]);
  expect(result).not.toBeNull();
});

it('streamed inventory failures still reach the existing error boundary', async () => {
  state.failInventory = true;
  const page = await LocationPage({
    params: Promise.resolve({ locationId: 'fixture' }),
    searchParams: Promise.resolve({}),
  });
  const content = page.props.children.at(-1).props.children;
  await expect(content.type(content.props)).rejects.toThrow('DATA_LOAD_FAILED');
});
