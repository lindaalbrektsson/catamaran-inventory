import { useEffect, useState } from 'react';
import { CashbookWorkspace } from '@/components/cashbook';
import type { Locale } from '@/lib/i18n';
import type {
  CashbookData,
  CashbookDue,
  CashbookTemplate,
  CashbookTransaction,
} from '@/lib/cashbook-types';

const actor = '40000000-0000-4000-8000-000000000001';
const stamp = '2026-09-24T05:30:00Z';
const templates: CashbookTemplate[] = [
  ['FOOD', 'Ceviche', 'Ceviche', 2000, null],
  ['FOOD', 'Fruit', 'Fruta', 2500, null],
  ['MONTHLY', 'Bodega rent', 'Renta de bodega', 80000, 1],
  ['MONTHLY', 'Social Security', 'Seguro Social', 15000, 15],
].map(([kind, name_en, name_es, default_amount_cents, due_day], index) => ({
  id: `50000000-0000-4000-8000-00000000000${index + 1}`,
  kind,
  name_en,
  name_es,
  default_amount_cents,
  due_day,
  active: true,
  created_by: actor,
  created_at: stamp,
  updated_at: stamp,
})) as CashbookTemplate[];
const dues: CashbookDue[] = [
  {
    template_id: templates[0].id,
    name_en: 'Ceviche',
    name_es: 'Ceviche',
    kind: 'FOOD',
    effective_date: '2026-09-21',
    quantity: 2,
    unit_amount_cents: 2000,
    amount_cents: 4000,
    period_month: null,
  },
  {
    template_id: templates[1].id,
    name_en: 'Fruit',
    name_es: 'Fruta',
    kind: 'FOOD',
    effective_date: '2026-09-21',
    quantity: 1,
    unit_amount_cents: 2500,
    amount_cents: 2500,
    period_month: null,
  },
  {
    template_id: templates[0].id,
    name_en: 'Ceviche',
    name_es: 'Ceviche',
    kind: 'FOOD',
    effective_date: '2026-09-23',
    quantity: 3,
    unit_amount_cents: 2000,
    amount_cents: 6000,
    period_month: null,
  },
  {
    template_id: templates[2].id,
    name_en: 'Bodega rent',
    name_es: 'Renta de bodega',
    kind: 'MONTHLY',
    effective_date: '2026-09-01',
    quantity: null,
    unit_amount_cents: null,
    amount_cents: 80000,
    period_month: '2026-09-01',
  },
  {
    template_id: templates[3].id,
    name_en: 'Social Security',
    name_es: 'Seguro Social',
    kind: 'MONTHLY',
    effective_date: '2026-09-15',
    quantity: null,
    unit_amount_cents: null,
    amount_cents: 15000,
    period_month: '2026-09-01',
  },
].map((row, index) => ({
  ...row,
  id: `60000000-0000-4000-8000-00000000000${index + 1}`,
  comment: '',
  status: 'PENDING',
  created_by: actor,
  creator_name: 'Jackie',
  created_at: stamp,
  updated_at: stamp,
  version: 1,
  paid_transaction_id: null,
  paid_amount_cents: null,
  paid_at: null,
  paid_by: null,
})) as CashbookDue[];
const transactions: CashbookTransaction[] = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    request_id: '80000000-0000-4000-8000-000000000001',
    kind: 'INCOME',
    effective_date: '2026-09-23',
    amount_cents: 100000,
    source_account: null,
    destination_account: 'CASH',
    comment: 'Cash from customer',
    created_by: actor,
    created_at: stamp,
    creator_name: 'Jackie',
    reverses_transaction_id: null,
    correction_of: null,
    status: 'POSTED',
    original_kind: 'INCOME',
    debt_ids: [],
    payment_kind: null,
    payment_reference: null,
  },
];

export function CashbookFixture({ locale }: { locale: Locale }) {
  const params = new URLSearchParams(location.search);
  const [data, setData] = useState<CashbookData>(() => ({
    today: '2026-09-23',
    balances: {
      cash_cents: 150000,
      account_cents: 50000,
      total_cents: 200000,
      cash_opened: !params.has('unopened'),
      account_opened: !params.has('unopened'),
    },
    transactions,
    templates,
    dues,
    hasMore: false,
    filters: {
      from: '',
      to: '',
      month: '2026-09-01',
      view:
        params.get('tab') === 'payments'
          ? 'payments'
          : params.get('tab') === 'templates'
            ? 'templates'
            : 'ledger',
      foodView: 'all',
      page: 1,
    },
  }));
  useEffect(() => {
    sessionStorage.setItem('cashbook-fixture-dues', JSON.stringify(dues));
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<Record<string, string | string[]>>).detail;
      setData((previous) => {
        if (payload.action === 'POST') {
          const cents = Math.round(Number(payload.amount) * 100);
          let cash = previous.balances.cash_cents,
            account = previous.balances.account_cents;
          if (payload.source_account === 'CASH') cash -= cents;
          if (payload.source_account === 'ACCOUNT') account -= cents;
          if (payload.destination_account === 'CASH') cash += cents;
          if (payload.destination_account === 'ACCOUNT') account += cents;
          return {
            ...previous,
            balances: {
              ...previous.balances,
              cash_cents: cash,
              account_cents: account,
              total_cents: cash + account,
            },
          };
        }
        if (payload.action === 'PAY')
          return {
            ...previous,
            dues: previous.dues.map((row) =>
              (payload.ids as string[]).includes(row.id)
                ? {
                    ...row,
                    status: 'PAID',
                    paid_amount_cents: row.amount_cents,
                    paid_at: stamp,
                    paid_by: actor,
                    paid_by_name: 'Jackie',
                    paid_transaction_id: transactions[0].id,
                  }
                : row,
            ),
          };
        return previous;
      });
    };
    window.addEventListener('cashbook-fixture-mutation', handler);
    return () => window.removeEventListener('cashbook-fixture-mutation', handler);
  }, []);
  return (
    <CashbookWorkspace
      initialAction={params.get('action') ?? undefined}
      locale={locale}
      data={data}
      isOwner={params.get('role') !== 'jackie'}
    />
  );
}
