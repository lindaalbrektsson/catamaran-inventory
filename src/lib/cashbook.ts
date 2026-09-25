import 'server-only';
import { cache } from 'react';
import { getProfile } from './auth';
import { supabase } from './supabase/server';
import { collect } from './inventory';
import { cashbookBelizeDate, safeMinor } from './cashbook-domain';
import { cashbookFilters } from './cashbook-input';
import type { CashbookBalances, CashbookData, CashbookDue } from './cashbook-types';
import { z } from 'zod';

// Request-scoped only. Never cache authorization or live financial balances across users.
export const hasCashbookAccess = cache(async () => {
  const profile = await getProfile();
  if (!profile?.active) return false;
  if (profile.role === 'OWNER') return true;
  if (profile.role !== 'MANAGER') return false;
  const { data, error } = await (await supabase()).rpc('cashbook_access');
  if (error) throw new Error('CASHBOOK_ACCESS_LOAD_FAILED');
  return data === true;
});

export async function cashbookData(
  params: Record<string, string | string[] | undefined>,
): Promise<CashbookData> {
  if (!(await hasCashbookAccess())) throw new Error('FORBIDDEN');
  const db = await supabase(),
    today = cashbookBelizeDate();
  const filters = cashbookFilters(params, today);
  const ledger = filters.view === 'ledger';
  const selected =
    typeof params.transaction === 'string' ? z.uuid().parse(params.transaction) : null;
  const history = () => {
    let query = db.from('cashbook_transaction_history').select('*');
    if (selected) query = query.eq('id', selected);
    else query = query.gte('effective_date', filters.from).lte('effective_date', filters.to);
    return query
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(selected ? 0 : (filters.page - 1) * 20, selected ? 0 : filters.page * 20);
  };
  const [balanceResult, historyResult, templates, dues] = await Promise.all([
    db.rpc('cashbook_balances'),
    ledger ? history() : Promise.resolve({ data: [], error: null }),
    collect((from, to) => {
      let query = db.from('cashbook_templates').select('*');
      // Cashflow needs only the active concepts used by the shared Food Debt form.
      if (ledger) query = query.eq('kind', 'FOOD').eq('active', true);
      return query.order('kind').order('name_en').order('id').range(from, to);
    }),
    filters.view === 'payments'
      ? collect((from, to) =>
          db
            .from('cashbook_due')
            .select('*')
            // Old unpaid entries must never disappear merely because a new period started.
            .or(
              `status.eq.PENDING,and(status.eq.PAID,effective_date.gte.${filters.from},effective_date.lte.${filters.to}),and(kind.eq.MONTHLY,period_month.eq.${filters.month})`,
            )
            .order('effective_date')
            .order('id')
            .range(from, to),
        )
      : Promise.resolve([] as CashbookDue[]),
  ]);
  if (balanceResult.error || !balanceResult.data || historyResult.error || !historyResult.data)
    throw new Error('CASHBOOK_LOAD_FAILED');
  const balances = parseBalances(balanceResult.data);
  return {
    today,
    filters,
    balances,
    templates,
    dues,
    transactions: historyResult.data.slice(0, 20),
    hasMore: historyResult.data.length > 20,
  };
}

function parseBalances(data: unknown): CashbookBalances {
  return z
    .object({
      cash_cents: z.union([z.number(), z.string()]).transform(safeMinor),
      account_cents: z.union([z.number(), z.string()]).transform(safeMinor),
      total_cents: z.union([z.number(), z.string()]).transform(safeMinor),
      cash_opened: z.boolean(),
      account_opened: z.boolean(),
    })
    .parse(data) satisfies CashbookBalances;
}

export async function cashbookHomeBalances() {
  if (!(await hasCashbookAccess())) throw new Error('FORBIDDEN');
  const { data, error } = await (await supabase()).rpc('cashbook_balances');
  if (error || !data) throw new Error('CASHBOOK_LOAD_FAILED');
  return parseBalances(data);
}
