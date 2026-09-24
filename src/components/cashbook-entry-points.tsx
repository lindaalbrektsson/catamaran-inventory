import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Utensils } from 'lucide-react';
import { hasCashbookAccess, cashbookHomeBalances } from '@/lib/cashbook';
import { dictionary, type Locale } from '@/lib/i18n';

export async function CashbookHomeCard({ locale }: { locale: Locale }) {
  if (!(await hasCashbookAccess())) return null;
  const t = dictionary(locale);
  let balances;
  try {
    balances = await cashbookHomeBalances();
  } catch {
    /* Keep navigation available on a failed balance read. */
  }
  const money = (value: number) =>
    new Intl.NumberFormat(locale === 'es' ? 'es-BZ' : 'en-BZ', {
      style: 'currency',
      currency: 'BZD',
      currencyDisplay: 'code',
    }).format(value / 100);
  return (
    <section className="mt-4 rounded-2xl border bg-card p-4" aria-label={t.cashbook}>
      <h2 className="text-xl font-semibold">{t.cashbook}</h2>
      {balances ? (
        <dl className="my-3 grid gap-2 text-sm">
          {[
            [t.cashbookCash, balances.cash_cents, balances.cash_opened],
            [t.cashbookAccount, balances.account_cents, balances.account_opened],
            [
              t.cashbookTotal,
              balances.total_cents,
              balances.cash_opened && balances.account_opened,
            ],
          ].map(([label, value, opened]) => (
            <div key={String(label)} className="flex flex-wrap justify-between gap-2">
              <dt>{label}</dt>
              <dd className="font-semibold tabular-nums">{opened ? money(Number(value)) : '—'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p role="status" className="my-3 text-sm">
          {t.errorTitle}
        </p>
      )}
      <Link
        href="/cashbook"
        prefetch={false}
        className="inline-flex min-h-12 items-center font-semibold underline"
      >
        {t.cashbookView}
      </Link>
    </section>
  );
}

export async function CashbookAddActions({ locale }: { locale: Locale }) {
  if (!(await hasCashbookAccess())) return null;
  const t = dictionary(locale);
  const actions = [
    { action: 'INCOME', label: t.cashbookAddIncome, icon: ArrowDownLeft },
    { action: 'EXPENSE', label: t.cashbookAddExpense, icon: ArrowUpRight },
    { action: 'TRANSFER', label: t.cashbookTransfer, icon: ArrowLeftRight },
    { action: 'FOOD', label: t.cashbookAddFood, icon: Utensils },
  ];
  return (
    <section className="mt-6" aria-label={t.cashbook}>
      <h2 className="mb-3 text-lg font-semibold">{t.cashbook}</h2>
      <div className="grid gap-2">
        {actions.map(({ action, label, icon: Icon }) => (
          <Link
            key={action}
            href={`/cashbook?view=${action === 'FOOD' ? 'payments' : 'ledger'}&action=${action}`}
            prefetch={false}
            className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 py-2"
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
