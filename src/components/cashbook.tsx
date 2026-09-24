'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet } from 'lucide-react';
import { dictionary, type Locale } from '@/lib/i18n';
import type {
  CashbookBalances,
  CashbookData,
  CashbookDue,
  CashbookTransaction,
} from '@/lib/cashbook-types';
import { cashbookPaymentDetails } from '@/lib/cashbook-actions';
import {
  CashbookAccountField,
  CashbookAmount,
  CashbookComment,
  CashbookConfirmation,
  CashbookDateField,
  CashbookForm,
  cashbookDay,
  cashbookMoney,
} from './cashbook-controls';
import { CashbookFoodLines, CashbookPayments } from './cashbook-payments';
import { CashbookTemplates } from './cashbook-templates';
import { Button } from './ui/button';
import { Input } from './ui/input';

type EntryKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OPENING';

function entryTitle(kind: EntryKind, locale: Locale) {
  const t = dictionary(locale);
  return kind === 'INCOME'
    ? t.cashbookAddIncome
    : kind === 'EXPENSE'
      ? t.cashbookAddExpense
      : kind === 'TRANSFER'
        ? t.cashbookTransfer
        : t.cashbookOpening;
}

function MovementForm({
  locale,
  today,
  kind,
  balances,
  transaction,
  mode,
  onClose,
}: {
  locale: Locale;
  today: string;
  kind: EntryKind | 'PAYMENT';
  balances: CashbookBalances;
  transaction?: CashbookTransaction;
  mode?: 'VOID' | 'CORRECT';
  onClose: () => void;
}) {
  const t = dictionary(locale);
  const [source, setSource] = useState<string>(transaction?.source_account ?? 'ACCOUNT');
  const isVoid = mode === 'VOID',
    correction = Boolean(transaction);
  return (
    <CashbookForm
      locale={locale}
      operation={mode ?? 'POST'}
      title={
        isVoid
          ? t.cashbookVoid
          : correction
            ? t.cashbookCorrect
            : entryTitle(kind as EntryKind, locale)
      }
      onSaved={onClose}
      onCancel={onClose}
    >
      <input type="hidden" name="kind" value={kind} />
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      {correction && (
        <p className="text-sm text-muted-foreground">
          {isVoid ? t.cashbookVoidHelp : t.cashbookCorrectHelp}
        </p>
      )}
      {!isVoid && (
        <>
          <CashbookAmount
            label={t.cashbookAmount}
            defaultCents={transaction?.amount_cents}
            allowZero={kind === 'OPENING'}
            readOnly={transaction?.payment_kind === 'FOOD'}
          />
          {kind === 'TRANSFER' ? (
            <>
              <CashbookAccountField
                locale={locale}
                name="source_account"
                label={t.cashbookSource}
                value={source}
                onChange={setSource}
              />
              <CashbookAccountField
                locale={locale}
                name="destination_account"
                label={t.cashbookDestination}
                value={source === 'CASH' ? 'ACCOUNT' : 'CASH'}
                exclude={source}
              />
            </>
          ) : kind === 'INCOME' || kind === 'OPENING' ? (
            <CashbookAccountField
              locale={locale}
              name="destination_account"
              label={t.cashbookDestination}
              defaultValue={
                transaction?.destination_account ??
                (kind === 'OPENING' && balances.cash_opened ? 'ACCOUNT' : 'CASH')
              }
              exclude={
                kind === 'OPENING'
                  ? transaction
                    ? transaction.destination_account === 'CASH'
                      ? 'ACCOUNT'
                      : 'CASH'
                    : balances.cash_opened
                      ? 'CASH'
                      : balances.account_opened
                        ? 'ACCOUNT'
                        : undefined
                  : undefined
              }
            />
          ) : (
            <CashbookAccountField
              locale={locale}
              name="source_account"
              label={t.cashbookSource}
              defaultValue={transaction?.source_account ?? 'CASH'}
            />
          )}
          <CashbookComment
            locale={locale}
            defaultValue={transaction?.comment}
            required={kind !== 'OPENING'}
          />
        </>
      )}
      <CashbookDateField locale={locale} today={today} />
      {correction && (
        <>
          <CashbookComment locale={locale} name="reason" label={t.cashbookReason} required />
          <CashbookConfirmation
            label={isVoid ? t.cashbookConfirmVoid : t.cashbookConfirmCorrection}
          />
        </>
      )}
    </CashbookForm>
  );
}

function PaymentDetails({ id, locale }: { id: string; locale: Locale }) {
  const t = dictionary(locale),
    [pending, start] = useTransition();
  const [dues, setDues] = useState<CashbookDue[] | null>(null);
  const [error, setError] = useState('');
  return (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (dues) {
            setDues(null);
            return;
          }
          start(async () => {
            try {
              const result = await cashbookPaymentDetails(id);
              if ('error' in result && result.error) setError(t[result.error]);
              else if ('dues' in result) {
                setDues(result.dues);
                setError('');
              }
            } catch {
              setError(t.cashbookError);
            }
          });
        }}
      >
        {pending ? t.loading : t.cashbookLinkedPayment}
      </Button>
      {error && <p role="alert">{error}</p>}
      {dues && (
        <div className="grid gap-3">
          {dues[0]?.kind === 'FOOD' ? (
            <CashbookFoodLines rows={dues} locale={locale} />
          ) : (
            dues.map((due) => (
              <p key={due.id}>
                {locale === 'es' ? due.name_es : due.name_en} ·{' '}
                {cashbookDay(due.period_month!, locale, true)} ·{' '}
                {cashbookMoney(due.paid_amount_cents ?? due.amount_cents ?? 0, locale)}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TransactionCard({
  locale,
  transaction: tx,
  data,
  isOwner,
}: {
  locale: Locale;
  transaction: CashbookTransaction;
  data: CashbookData;
  isOwner: boolean;
}) {
  const t = dictionary(locale),
    [mode, setMode] = useState<'CORRECT' | 'VOID' | null>(null);
  const account = (value: string) => (value === 'CASH' ? t.cashbookCash : t.cashbookAccount);
  const label = {
    INCOME: t.cashbookIncome,
    EXPENSE: t.cashbookExpense,
    TRANSFER: t.cashbookTransfer,
    OPENING: t.cashbookOpening,
    PAYMENT: t.cashbookPayment,
    REVERSAL: t.cashbookReversal,
  }[tx.kind];
  const sign =
    tx.kind === 'TRANSFER' || (tx.kind === 'REVERSAL' && tx.original_kind === 'TRANSFER')
      ? '↔'
      : tx.destination_account
        ? '+'
        : '−';
  return (
    <article
      id={`transaction-${tx.id}`}
      className="grid min-w-0 gap-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{tx.comment || label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx.source_account && account(tx.source_account)}
            {tx.source_account && tx.destination_account && ' → '}
            {tx.destination_account && account(tx.destination_account)}
          </p>
        </div>
        <strong className="whitespace-nowrap tabular-nums">
          {sign} {cashbookMoney(tx.amount_cents, locale)}
        </strong>
      </div>
      <p className="text-sm text-muted-foreground">
        {cashbookDay(tx.effective_date, locale)} · {tx.creator_name ?? tx.created_by}
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1">{label}</span>
        {tx.status !== 'POSTED' && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">
            {tx.status === 'VOIDED' ? t.cashbookVoided : t.cashbookCorrected}
          </span>
        )}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t.cashbookDetails}
        </summary>
        <dl className="grid gap-2 py-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{t.cashbookReference}</dt>
            <dd className="break-all">{tx.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t.cashbookCreatedBy}</dt>
            <dd className="break-all">
              {tx.creator_name} · {tx.created_by}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t.cashbookRecordedAt}</dt>
            <dd>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'America/Belize',
              }).format(new Date(tx.created_at))}
            </dd>
          </div>
          {(tx.reverses_transaction_id || tx.correction_of) && (
            <div>
              <dt className="text-muted-foreground">{t.cashbookOriginal}</dt>
              <dd>
                <Link
                  className="break-all underline"
                  href={`/cashbook?transaction=${tx.reverses_transaction_id ?? tx.correction_of}`}
                >
                  {tx.reverses_transaction_id ?? tx.correction_of}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {tx.debt_ids.length > 0 && <PaymentDetails id={tx.id} locale={locale} />}
      </details>
      {tx.status === 'POSTED' && tx.kind !== 'REVERSAL' && (tx.kind !== 'OPENING' || isOwner) && (
        <>
          {mode ? (
            <MovementForm
              key={mode}
              locale={locale}
              today={data.today}
              kind={tx.kind}
              balances={data.balances}
              transaction={tx}
              mode={mode}
              onClose={() => setMode(null)}
            />
          ) : (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={() => setMode('CORRECT')}>
                {t.cashbookCorrect}
              </Button>
              {tx.kind !== 'OPENING' && (
                <Button type="button" variant="ghost" onClick={() => setMode('VOID')}>
                  {t.cashbookVoid}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function CashbookWorkspace({
  locale,
  data,
  isOwner,
  initialAction,
}: {
  locale: Locale;
  data: CashbookData;
  isOwner: boolean;
  initialAction?: string;
}) {
  const t = dictionary(locale),
    [adding, setAdding] = useState<EntryKind | null>(
      ['INCOME', 'EXPENSE', 'TRANSFER'].includes(initialAction ?? '')
        ? (initialAction as EntryKind)
        : null,
    );
  const { balances, filters } = data;
  const query = (patch: Record<string, string>) => {
    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      month: filters.month,
      view: filters.view,
      ...patch,
    });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    return '/cashbook?' + params.toString();
  };
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label={t.cashbookTotal}>
        {[
          { name: t.cashbookCash, value: balances.cash_cents, opened: balances.cash_opened },
          {
            name: t.cashbookAccount,
            value: balances.account_cents,
            opened: balances.account_opened,
          },
          {
            name: t.cashbookTotal,
            value: balances.total_cents,
            opened: balances.cash_opened && balances.account_opened,
          },
        ].map((item, index) => (
          <div
            key={item.name}
            className={`grid content-start gap-2 rounded-2xl border p-4 ${index === 2 ? 'col-span-2 bg-primary text-primary-foreground md:col-span-1' : 'bg-card'}`}
          >
            <p className="text-sm">{item.name}</p>
            <strong className="text-xl tabular-nums sm:text-2xl">
              {item.opened ? cashbookMoney(item.value, locale) : '—'}
            </strong>
            {!item.opened && <p className="text-xs">{t.cashbookNoOpening}</p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t.cashbookMoneyHint}</p>
      {(!balances.cash_opened || !balances.account_opened) && (
        <div className="grid gap-3 rounded-xl border bg-warning-soft p-4">
          <p className="text-sm">{t.cashbookOpeningHelp}</p>
          {isOwner && !adding && (
            <Button type="button" className="w-fit" onClick={() => setAdding('OPENING')}>
              <Wallet aria-hidden="true" />
              {t.cashbookOpening}
            </Button>
          )}
        </div>
      )}
      {adding ? (
        <MovementForm
          key={adding}
          locale={locale}
          today={data.today}
          kind={adding}
          balances={balances}
          onClose={() => setAdding(null)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Button className="min-h-14" onClick={() => setAdding('INCOME')}>
            <ArrowDownLeft aria-hidden="true" />
            {t.cashbookAddIncome}
          </Button>
          <Button className="min-h-14" variant="outline" onClick={() => setAdding('EXPENSE')}>
            <ArrowUpRight aria-hidden="true" />
            {t.cashbookAddExpense}
          </Button>
          <Button
            className="col-span-2 min-h-14 sm:col-span-1"
            variant="outline"
            onClick={() => setAdding('TRANSFER')}
          >
            <ArrowLeftRight aria-hidden="true" />
            {t.cashbookTransfer}
          </Button>
        </div>
      )}
      <nav className="flex flex-wrap gap-2 border-b pb-4" aria-label={t.cashbook}>
        {(['ledger', 'payments', ...(isOwner ? (['templates'] as const) : [])] as const).map(
          (view) => (
            <Link
              key={view}
              href={query({ view })}
              aria-current={filters.view === view ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center rounded-xl border px-4 py-3 text-sm font-semibold ${filters.view === view ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
            >
              {view === 'ledger'
                ? t.cashbook
                : view === 'payments'
                  ? t.cashbookPayments
                  : t.cashbookTemplates}
            </Link>
          ),
        )}
      </nav>
      {filters.view !== 'templates' && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {t.cashbookFilter}
          </summary>
          <form
            action="/cashbook"
            method="get"
            className="grid gap-3 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="view" value={filters.view} />
            <input type="hidden" name="month" value={filters.month} />
            <label className="grid min-w-0 gap-2 text-sm">
              {t.cashbookFrom}
              <Input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="grid min-w-0 gap-2 text-sm">
              {t.cashbookTo}
              <Input
                type="date"
                name="to"
                defaultValue={filters.to}
                min={filters.from || undefined}
              />
            </label>
            <Button type="submit" variant="outline">
              {t.cashbookApply}
            </Button>
            <Link className="min-h-11 py-2 text-sm underline" href={query({ from: '', to: '' })}>
              {t.cashbookClear}
            </Link>
          </form>
        </details>
      )}
      {filters.view === 'ledger' ? (
        <section className="grid gap-4" aria-label={t.cashbookMovements}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t.cashbookMovements}</h2>
            {isOwner && (
              <a
                href={`/cashbook/export?${new URLSearchParams({ from: filters.from, to: filters.to })}`}
                className="hidden min-h-12 items-center rounded-xl border bg-card px-4 py-3 text-sm font-semibold md:inline-flex"
              >
                {t.cashbookExport}
              </a>
            )}
          </div>
          {!data.transactions.length && (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              {t.cashbookNoTransactions}
            </p>
          )}
          {data.transactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              locale={locale}
              transaction={transaction}
              data={data}
              isOwner={isOwner}
            />
          ))}
          <div className="flex gap-3">
            {filters.page > 1 && (
              <Link
                className="min-h-12 rounded-xl border px-4 py-3"
                href={query({ page: String(filters.page - 1) })}
              >
                {t.cashbookNewer}
              </Link>
            )}
            {data.hasMore && (
              <Link
                className="min-h-12 rounded-xl border px-4 py-3"
                href={query({ page: String(filters.page + 1) })}
              >
                {t.cashbookOlder}
              </Link>
            )}
          </div>
        </section>
      ) : filters.view === 'payments' ? (
        <CashbookPayments locale={locale} data={data} initialFood={initialAction === 'FOOD'} />
      ) : isOwner ? (
        <CashbookTemplates locale={locale} templates={data.templates} />
      ) : null}
    </div>
  );
}
