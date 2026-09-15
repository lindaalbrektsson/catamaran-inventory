import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireProfile: m.profile }));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { archiveInventoryItem } from '@/lib/catalog-actions';
const id = '30000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ error: null });
});
it.each(['MANAGER', 'CAPTAIN', 'CREW'])(
  'archive server action rejects %s before database call',
  async (role) => {
    m.profile.mockResolvedValue({ role });
    expect(await archiveInventoryItem(id)).toEqual({ error: 'FORBIDDEN' });
    expect(m.rpc).not.toHaveBeenCalled();
  },
);
it('Owner archives through narrow RPC; rejects malformed ID and handles failure', async () => {
  m.profile.mockResolvedValue({ role: 'OWNER' });
  expect(await archiveInventoryItem('invalid')).toEqual({ error: 'INVALID_INPUT' });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(await archiveInventoryItem(id)).toEqual({ success: true });
  expect(m.rpc).toHaveBeenCalledWith('archive_inventory_item', { p_id: id });
  m.rpc.mockResolvedValue({ error: { message: 'PRIVATE' } });
  expect(await archiveInventoryItem(id)).toEqual({ error: 'UNKNOWN' });
});
