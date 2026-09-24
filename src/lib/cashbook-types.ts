import type { CashbookReportAccount, CashbookReportKind } from './cashbook-domain';

export type CashbookAccount = CashbookReportAccount;
export type CashbookTemplate = {
  id: string;
  kind: 'FOOD' | 'MONTHLY';
  name_en: string;
  name_es: string;
  default_amount_cents: number | null;
  due_day: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type CashbookDebt = {
  id: string;
  template_id: string;
  kind: 'FOOD' | 'MONTHLY';
  name_en: string;
  name_es: string;
  effective_date: string;
  period_month: string | null;
  quantity: number | null;
  unit_amount_cents: number | null;
  amount_cents: number | null;
  comment: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};
export type CashbookDue = CashbookDebt & {
  status: 'PENDING' | 'PAID';
  paid_transaction_id: string | null;
  paid_amount_cents: number | null;
  paid_at: string | null;
  paid_by: string | null;
  creator_name?: string | null;
  paid_by_name?: string | null;
};
export type CashbookTransactionRow = {
  id: string;
  request_id: string;
  kind: CashbookReportKind;
  effective_date: string;
  amount_cents: number;
  source_account: CashbookAccount | null;
  destination_account: CashbookAccount | null;
  comment: string;
  created_by: string;
  created_at: string;
  reverses_transaction_id: string | null;
  correction_of: string | null;
};
export type CashbookTransaction = CashbookTransactionRow & {
  status: 'POSTED' | 'VOIDED' | 'CORRECTED';
  original_kind: CashbookReportKind | null;
  creator_name: string | null;
  debt_ids: string[];
  payment_kind: 'FOOD' | 'MONTHLY' | null;
  payment_reference: string | null;
  related_transaction_ids?: string[];
};
export type CashbookEntry = {
  id: string;
  transaction_id: string;
  account: CashbookAccount;
  amount_cents: number;
  created_at: string;
};
export type CashbookBalances = {
  cash_cents: number;
  account_cents: number;
  total_cents: number;
  cash_opened: boolean;
  account_opened: boolean;
};
export type CashbookFilters = {
  from: string;
  to: string;
  month: string;
  view: 'ledger' | 'payments' | 'templates';
  foodView: 'all' | 'today' | 'period' | 'previous';
  page: number;
};
export type CashbookData = {
  today: string;
  balances: CashbookBalances;
  transactions: CashbookTransaction[];
  templates: CashbookTemplate[];
  dues: CashbookDue[];
  hasMore: boolean;
  filters: CashbookFilters;
};
