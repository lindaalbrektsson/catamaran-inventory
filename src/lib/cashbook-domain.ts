import { belizeDate } from './task-domain';

export const CASHBOOK_MAX_AMOUNT_CENTS = 999999999999;
export const cashbookAccounts = ['CASH', 'ACCOUNT'] as const;
export type CashbookReportAccount = (typeof cashbookAccounts)[number];
export type CashbookReportKind =
  'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OPENING' | 'PAYMENT' | 'REVERSAL';
export const cashbookBelizeDate = belizeDate;

// Form values are parsed as decimal text: multiplying a JS float by 100 loses cents.
export function moneyToMinor(value: string | number, options: { allowZero?: boolean } = {}) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('CASHBOOK_AMOUNT');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(CASHBOOK_MAX_AMOUNT_CENTS) || cents < (options.allowZero ? 0n : 1n))
    throw new Error('CASHBOOK_AMOUNT');
  return Number(cents);
}

export function safeMinor(value: number | string) {
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) throw new Error('CASHBOOK_AMOUNT');
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('CASHBOOK_AMOUNT');
  return result;
}

export function sumMinor(values: readonly (number | string)[]) {
  const total = values.reduce<bigint>((sum, value) => sum + BigInt(safeMinor(value)), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error('CASHBOOK_AMOUNT');
  return Number(total);
}

export function minorToInput(value: number | string) {
  const amount = BigInt(safeMinor(value));
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function foodTotalMinor(quantity: string | number, unitCents: number | string) {
  if (!/^\d+$/.test(String(quantity))) throw new Error('CASHBOOK_QUANTITY');
  const count = Number(quantity),
    unit = safeMinor(unitCents);
  if (!Number.isInteger(count) || count < 1 || count > 100000 || unit < 0)
    throw new Error('CASHBOOK_QUANTITY');
  const total = BigInt(count) * BigInt(unit);
  if (total < 1n || total > BigInt(CASHBOOK_MAX_AMOUNT_CENTS)) throw new Error('CASHBOOK_AMOUNT');
  return Number(total);
}

export function isCashbookDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= '0001-01-01' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function cashbookDateRange(from: string, to: string) {
  if (!isCashbookDate(from) || !isCashbookDate(to) || from > to) throw new Error('CASHBOOK_DATE');
  return { from, to };
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// Wednesday belongs to the period being settled, which starts the prior Thursday.
export function foodSettlementPeriod(date = cashbookBelizeDate()) {
  if (!isCashbookDate(date)) throw new Error('CASHBOOK_DATE');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const to = addDays(date, (3 - weekday + 7) % 7);
  return { from: addDays(to, -6), to };
}

export function foodEntryView(
  date: string,
  today = cashbookBelizeDate(),
): 'today' | 'period' | 'previous' | 'future' {
  if (!isCashbookDate(date)) throw new Error('CASHBOOK_DATE');
  const period = foodSettlementPeriod(today);
  return date === today
    ? 'today'
    : date < period.from
      ? 'previous'
      : date <= period.to
        ? 'period'
        : 'future';
}

export function monthlyDueDate(month: string, dueDay: number) {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !isCashbookDate(`${month}-01`) ||
    !Number.isInteger(dueDay) ||
    dueDay < 1 ||
    dueDay > 31
  )
    throw new Error('CASHBOOK_DATE');
  const first = new Date(`${month}-01T12:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + 1, 0);
  return `${month}-${String(Math.min(dueDay, first.getUTCDate())).padStart(2, '0')}`;
}

export type CashbookFoodGroupInput = {
  id: string;
  effective_date: string;
  total_cents: number | string;
  status: string;
};

// Period tabs are views only. Settlement uses ALL unpaid rows, including older debt.
export function groupUnpaidFood<T extends CashbookFoodGroupInput>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (row.status !== 'PENDING') continue;
    if (!isCashbookDate(row.effective_date)) throw new Error('CASHBOOK_DATE');
    const day = groups.get(row.effective_date) ?? [];
    day.push(row);
    groups.set(row.effective_date, day);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      entries,
      totalCents: sumMinor(entries.map((entry) => entry.total_cents)),
    }));
}

export type CashbookReportTransaction = {
  id: string;
  kind: CashbookReportKind;
  effective_date: string;
  amount_cents: number | string;
  source_account: CashbookReportAccount | null;
  destination_account: CashbookReportAccount | null;
  comment: string;
  created_by: string;
  created_at: string;
  reverses_transaction_id: string | null;
  correction_of: string | null;
  status: 'POSTED' | 'VOIDED' | 'CORRECTED';
  original_kind: CashbookReportKind | null;
  creator_name: string | null;
  payment_reference?: string | null;
  related_transaction_ids?: string[];
};

export type CashbookReportEntry = {
  id: string;
  transaction_id: string;
  account: CashbookReportAccount;
  amount_cents: number | string;
};

export type CashbookAccountSummary = {
  openingCents: number;
  incomeCents: number;
  expenseCents: number;
  transferInCents: number;
  transferOutCents: number;
  openingAdjustmentsCents: number;
  closingCents: number;
};

export type CashbookReportInput = {
  from: string;
  to: string;
  transactions: readonly CashbookReportTransaction[];
  entries: readonly CashbookReportEntry[];
};

export function cashbookReportCategory(transaction: CashbookReportTransaction) {
  if (transaction.kind !== 'REVERSAL') return transaction.kind;
  if (!transaction.original_kind || transaction.original_kind === 'REVERSAL')
    throw new Error('CASHBOOK_REPORT_INCOMPLETE');
  return transaction.original_kind;
}

// Reconciliation only. The database ledger/RPC remains the authoritative balance source.
// Callers must load complete history through `to`, not just the visible page/date range.
export function cashbookPeriodSummary(input: CashbookReportInput) {
  const { from, to } = cashbookDateRange(input.from, input.to);
  const transactions = new Map<string, CashbookReportTransaction>();
  for (const transaction of input.transactions) {
    if (transactions.has(transaction.id)) throw new Error('CASHBOOK_REPORT_INCOMPLETE');
    if (!isCashbookDate(transaction.effective_date)) throw new Error('CASHBOOK_DATE');
    safeMinor(transaction.amount_cents);
    transactions.set(transaction.id, transaction);
  }
  const empty = (): CashbookAccountSummary => ({
    openingCents: 0,
    incomeCents: 0,
    expenseCents: 0,
    transferInCents: 0,
    transferOutCents: 0,
    openingAdjustmentsCents: 0,
    closingCents: 0,
  });
  const accounts = { CASH: empty(), ACCOUNT: empty() };
  const seen = new Set<string>();
  const transactionEntries = new Map<string, CashbookReportEntry[]>();
  for (const entry of input.entries) {
    if (seen.has(entry.id)) throw new Error('CASHBOOK_REPORT_INCOMPLETE');
    seen.add(entry.id);
    const transaction = transactions.get(entry.transaction_id);
    if (!transaction || !cashbookAccounts.includes(entry.account))
      throw new Error('CASHBOOK_REPORT_INCOMPLETE');
    const legs = transactionEntries.get(transaction.id) ?? [];
    legs.push(entry);
    transactionEntries.set(transaction.id, legs);
    const amount = safeMinor(entry.amount_cents),
      summary = accounts[entry.account];
    if (transaction.effective_date > to) continue;
    summary.closingCents = sumMinor([summary.closingCents, amount]);
    if (transaction.effective_date < from) {
      summary.openingCents = sumMinor([summary.openingCents, amount]);
      continue;
    }
    const category = cashbookReportCategory(transaction);
    const field =
      category === 'INCOME'
        ? 'incomeCents'
        : category === 'EXPENSE' || category === 'PAYMENT'
          ? 'expenseCents'
          : category === 'OPENING'
            ? 'openingAdjustmentsCents'
            : amount >= 0
              ? 'transferInCents'
              : 'transferOutCents';
    summary[field] = sumMinor([
      summary[field],
      field === 'expenseCents' || field === 'transferOutCents' ? -amount : amount,
    ]);
  }
  for (const transaction of input.transactions) {
    if (transaction.effective_date > to) continue;
    const legs = transactionEntries.get(transaction.id) ?? [];
    const category = cashbookReportCategory(transaction);
    const amount = safeMinor(transaction.amount_cents);
    const expected = [
      ...(transaction.source_account
        ? [{ account: transaction.source_account, amount: -amount }]
        : []),
      ...(transaction.destination_account
        ? [{ account: transaction.destination_account, amount }]
        : []),
    ];
    if (
      legs.length !== (category === 'TRANSFER' ? 2 : 1) ||
      legs.length !== expected.length ||
      (transaction.source_account &&
        transaction.source_account === transaction.destination_account) ||
      expected.some(
        (leg) =>
          legs.filter(
            (entry) =>
              entry.account === leg.account && safeMinor(entry.amount_cents) === leg.amount,
          ).length !== 1,
      )
    )
      throw new Error('CASHBOOK_REPORT_INCOMPLETE');
  }
  return {
    ...accounts,
    openingTotalCents: sumMinor([accounts.CASH.openingCents, accounts.ACCOUNT.openingCents]),
    totalCents: sumMinor([accounts.CASH.closingCents, accounts.ACCOUNT.closingCents]),
  };
}
