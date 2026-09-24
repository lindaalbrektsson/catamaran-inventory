import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
const m = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', async () => ({ ...(await vi.importActual('react')), cache: (fn: unknown) => fn }));
vi.mock('@/lib/auth', () => ({
  getProfile: m.profile,
  requireProfile: m.profile,
  getLocale: async () => 'en',
}));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ rpc: m.rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
import { hasCashbookAccess, cashbookHomeBalances } from '../src/lib/cashbook';
import { mutateCashbook } from '../src/lib/cashbook-actions';
import { GET as exportGET } from '../src/app/(workspace)/cashbook/export/route';
beforeEach(() => {
  vi.resetAllMocks();
  m.profile.mockResolvedValue({ active: true, role: 'OWNER', account_admin: false });
  m.rpc.mockResolvedValue({ data: true, error: null, status: 200 });
});
function form() {
  const data = new FormData();
  Object.entries({
    requestId: 'cb000000-0000-4000-8000-000000000010',
    action: 'POST',
    kind: 'INCOME',
    amount: '100.23',
    destination_account: 'CASH',
    effective_date: '2026-09-24',
    comment: 'Business cash',
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
describe('Cashbook authorization', () => {
  it('Owners need no account-admin capability and no extra membership roundtrip', async () => {
    expect(await hasCashbookAccess()).toBe(true);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('Jackie access is granted by database UUID membership, never name', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER', display_name: 'Changed name' });
    expect(await hasCashbookAccess()).toBe(true);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('cashbook_access');
  });
  it('a Manager named Jackie without membership is denied', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER', display_name: 'Jackie' });
    m.rpc.mockResolvedValue({ data: false, error: null });
    expect(await hasCashbookAccess()).toBe(false);
  });
  it.each([null, { active: false, role: 'OWNER' }, { active: true, role: 'CREW' }])(
    'no membership calls for unsigned, pending or unsupported profiles %j',
    async (profile) => {
      m.profile.mockResolvedValue(profile);
      expect(await hasCashbookAccess()).toBe(false);
      expect(m.rpc).not.toHaveBeenCalled();
    },
  );
  it('fails closed on membership outage', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER' });
    m.rpc.mockResolvedValue({ data: null, error: {} });
    await expect(hasCashbookAccess()).rejects.toThrow('CASHBOOK_ACCESS_LOAD_FAILED');
  });
});
describe('Cashbook server mutation boundary', () => {
  it('uses JWT RPC, exact minor units, and refreshes only Cashbook', async () => {
    m.rpc.mockResolvedValue({ data: { id: 'saved' }, error: null, status: 200 });
    expect(await mutateCashbook({}, form())).toEqual({ success: true, id: 'saved' });
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('cashbook_mutate', {
      p_request: 'cb000000-0000-4000-8000-000000000010',
      p_action: 'POST',
      p_values: {
        kind: 'INCOME',
        amount_cents: 10023,
        destination_account: 'CASH',
        effective_date: '2026-09-24',
        comment: 'Business cash',
      },
    });
    expect(m.revalidate.mock.calls).toEqual([['/cashbook'], ['/']]);
  });
  it('maps database access denial to Cashbook-specific copy', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER' });
    m.rpc.mockResolvedValue({ error: { message: 'FORBIDDEN' }, status: 400 });
    expect(await mutateCashbook({}, form())).toEqual({ error: 'cashbookAccessDenied' });
  });
  it.each(['ALREADY_PAID', 'STALE_DEBT', 'REQUEST_CONFLICT', 'OPENING_EXISTS'])(
    'shows review conflict for %s',
    async (message) => {
      m.rpc.mockResolvedValue({ error: { message }, status: 400 });
      expect(await mutateCashbook({}, form())).toEqual({ error: 'cashbookConflict' });
      expect(m.revalidate).not.toHaveBeenCalled();
    },
  );
  it('preserves ambiguous request ID so a network retry cannot create another movement', async () => {
    const data = form();
    m.rpc.mockRejectedValueOnce(new TypeError('network failure'));
    expect(await mutateCashbook({}, data)).toEqual({ error: 'cashbookUncertain', uncertain: true });
    m.rpc.mockResolvedValueOnce({ data: { id: 'saved' }, error: null, status: 200 });
    expect((await mutateCashbook({}, data)).success).toBe(true);
    expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
  });
  it('treats gateway timeout as ambiguous, not failed/unsaved', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'gateway' }, status: 504 });
    expect((await mutateCashbook({}, form())).uncertain).toBe(true);
  });
  it('invalid input never calls the database', async () => {
    const data = form();
    data.set('amount', '-500');
    expect(await mutateCashbook({}, data)).toEqual({ error: 'cashbookInvalid' });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
describe('Owner-only export', () => {
  it.each([null, { active: false, role: 'OWNER' }, { active: true, role: 'MANAGER' }])(
    'rejects non-Owner access before report reads %j',
    async (profile) => {
      m.profile.mockResolvedValue(profile);
      expect((await exportGET(new Request('http://localhost/cashbook/export'))).status).toBe(403);
      expect(m.rpc).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid date range', async () => {
    expect(
      (
        await exportGET(
          new Request('http://localhost/cashbook/export?from=2026-09-30&to=2026-09-01'),
        )
      ).status,
    ).toBe(400);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('uses one authorized immutable report snapshot and private download headers', async () => {
    m.rpc.mockResolvedValue({ data: { transactions: [], entries: [] }, error: null });
    const result = await exportGET(
      new Request('http://localhost/cashbook/export?from=2026-09-01&to=2026-09-30'),
    );
    expect(result.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('cashbook_report', { p_to: '2026-09-30' });
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(result.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect((await result.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
  it('fails closed rather than exporting incomplete ledger data', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    expect(
      (
        await exportGET(
          new Request('http://localhost/cashbook/export?from=2026-09-01&to=2026-09-30'),
        )
      ).status,
    ).toBe(503);
  });
  it('preserves snapshot references to a reversal after the exported period', async () => {
    const id = 'cb000000-0000-4000-8000-000000000010';
    const reversal = 'cb000000-0000-4000-8000-000000000011';
    m.rpc.mockResolvedValue({
      data: {
        transactions: [
          {
            id,
            kind: 'INCOME',
            effective_date: '2026-09-24',
            amount_cents: 29,
            source_account: null,
            destination_account: 'CASH',
            comment: 'Customer payment',
            created_by: 'cb000000-0000-4000-8000-000000000020',
            created_at: '2026-09-24T18:00:00Z',
            reverses_transaction_id: null,
            correction_of: null,
            status: 'VOIDED',
            original_kind: 'INCOME',
            creator_name: 'Jackie',
            payment_reference: null,
            related_transaction_ids: [reversal],
          },
        ],
        entries: [
          {
            id: 'cb000000-0000-4000-8000-000000000030',
            transaction_id: id,
            account: 'CASH',
            amount_cents: 29,
          },
        ],
      },
      error: null,
    });
    const result = await exportGET(
      new Request('http://localhost/cashbook/export?from=2026-09-01&to=2026-09-30'),
    );
    expect(result.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await result.arrayBuffer()) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0].getCell('B11').value).toBe(0.29);
    expect(workbook.worksheets[1].getCell('L2').value).toBe(reversal);
  });
});

describe('Cashbook Home financial boundary', () => {
  it('does not request balances for unauthorized Managers', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER' });
    m.rpc.mockResolvedValue({ data: false, error: null });
    await expect(cashbookHomeBalances()).rejects.toThrow('FORBIDDEN');
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('cashbook_access');
  });
  it.each(['OWNER', 'MANAGER'])(
    'loads only balance RPC after authorization for %s',
    async (role) => {
      m.profile.mockResolvedValue({ active: true, role });
      const balances = {
        cash_cents: 123,
        account_cents: 456,
        total_cents: 579,
        cash_opened: true,
        account_opened: true,
      };
      m.rpc.mockImplementation(async (name) => ({
        data: name === 'cashbook_access' ? true : balances,
        error: null,
      }));
      expect(await cashbookHomeBalances()).toEqual(balances);
      expect(m.rpc).toHaveBeenCalledWith('cashbook_balances');
    },
  );
});

// Exercise the actual server entry points: unauthorized users receive no markup/data.
import { renderToStaticMarkup } from 'react-dom/server';
import { CashbookHomeCard, CashbookAddActions } from '../src/components/cashbook-entry-points';
import { CashbookNavigationLink } from '../src/components/cashbook-navigation-link';
describe('Cashbook contextual entry points', () => {
  it('Ortega receives none of the three entry points or financial reads', async () => {
    m.profile.mockResolvedValue({ active: true, role: 'MANAGER', display_name: 'Ortega' });
    m.rpc.mockResolvedValue({ data: false, error: null });
    for (const component of [CashbookHomeCard, CashbookAddActions, CashbookNavigationLink]) {
      expect(await component({ locale: 'en' })).toBeNull();
    }
    expect(m.rpc.mock.calls.every(([name]) => name === 'cashbook_access')).toBe(true);
  });
  it.each(['OWNER', 'MANAGER'])('authorized %s sees Home, Add and More in EN/ES', async (role) => {
    m.profile.mockResolvedValue({ active: true, role });
    m.rpc.mockImplementation(async (name) => ({
      data:
        name === 'cashbook_access'
          ? true
          : {
              cash_cents: 123,
              account_cents: 456,
              total_cents: 579,
              cash_opened: true,
              account_opened: true,
            },
      error: null,
    }));
    for (const locale of ['en', 'es'] as const) {
      const home = renderToStaticMarkup(await CashbookHomeCard({ locale }));
      expect(home).toContain(locale === 'en' ? 'View cashbook' : 'Ver caja');
      expect(home).toContain('5.79');
      const add = renderToStaticMarkup(await CashbookAddActions({ locale }));
      for (const action of ['INCOME', 'EXPENSE', 'TRANSFER', 'FOOD'])
        expect(add).toContain(`action=${action}`);
      expect(renderToStaticMarkup(await CashbookNavigationLink({ locale }))).toContain(
        'href="/cashbook"',
      );
    }
    expect(m.rpc.mock.calls.some(([name]) => name === 'cashbook_mutate')).toBe(false);
  });
});
